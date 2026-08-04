-- =============================================================================
-- 127_driver_delivery_assignment.sql
-- =============================================================================
-- Let a picker (or office) assign a printed delivery load to a registered
-- driver, and let that driver mark the load delivered from the /driver app.
-- One load = one trip = one printed delivery note, so driver assignment lives
-- on delivery_loads (an invoice with split loads can have a driver per load).
--
--   1. delivery_loads.assigned_driver_id + assigned_at.
--   2. RLS: a driver can read loads assigned to them.
--   3. RPCs (service_role only; the action layer passes the verified user id,
--      mirroring save_pick_state in 114):
--        - assign_driver_to_load
--        - unassign_driver_from_load
--        - driver_mark_delivered
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Assignment columns
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.delivery_loads
  ADD COLUMN IF NOT EXISTS assigned_driver_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_delivery_loads_assigned_driver
  ON public.delivery_loads(assigned_driver_id)
  WHERE assigned_driver_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. RLS: drivers see only loads assigned to them (defence in depth; the app
--    reads through service_role actions, this guards any direct client read).
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'delivery_loads' AND policyname = 'delivery_loads_driver_assigned'
  ) THEN
    CREATE POLICY delivery_loads_driver_assigned ON public.delivery_loads
      FOR SELECT TO authenticated
      USING (auth.uid() = assigned_driver_id);
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. RPCs
-- ─────────────────────────────────────────────────────────────────────────────

-- Assign a driver to a load. Caller (p_assigned_by) must be an active
-- admin/staff/picker. The load must be printed or already completed (you only
-- assign a driver once there is a delivery note to hand over).
CREATE OR REPLACE FUNCTION public.assign_driver_to_load(
  p_load_id uuid,
  p_driver_id uuid,
  p_assigned_by uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_assigner_role text;
  v_driver_role text;
  v_load_status text;
BEGIN
  SELECT role INTO v_assigner_role FROM public.profiles
   WHERE id = p_assigned_by AND is_active = true;
  IF v_assigner_role NOT IN ('admin', 'staff', 'picker') THEN
    RAISE EXCEPTION 'Not authorised to assign a driver.' USING ERRCODE = '42501';
  END IF;

  SELECT role INTO v_driver_role FROM public.profiles
   WHERE id = p_driver_id AND is_active = true;
  IF v_driver_role <> 'driver' THEN
    RAISE EXCEPTION 'Selected user is not an active driver.' USING ERRCODE = 'P0001';
  END IF;

  SELECT status INTO v_load_status FROM public.delivery_loads WHERE id = p_load_id;
  IF v_load_status IS NULL THEN
    RAISE EXCEPTION 'Load not found.' USING ERRCODE = 'P0002';
  END IF;
  IF v_load_status NOT IN ('printed', 'completed') THEN
    RAISE EXCEPTION 'Only printed loads can be assigned to a driver.' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.delivery_loads
     SET assigned_driver_id = p_driver_id,
         assigned_at = now()
   WHERE id = p_load_id;
END;
$$;

-- Remove the driver assignment from a load.
CREATE OR REPLACE FUNCTION public.unassign_driver_from_load(
  p_load_id uuid,
  p_assigned_by uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_assigner_role text;
BEGIN
  SELECT role INTO v_assigner_role FROM public.profiles
   WHERE id = p_assigned_by AND is_active = true;
  IF v_assigner_role NOT IN ('admin', 'staff', 'picker') THEN
    RAISE EXCEPTION 'Not authorised to unassign a driver.' USING ERRCODE = '42501';
  END IF;

  UPDATE public.delivery_loads
     SET assigned_driver_id = NULL,
         assigned_at = NULL
   WHERE id = p_load_id;
END;
$$;

-- Driver marks their assigned load as delivered. Completes the load; when every
-- load for the invoice is completed, the invoice becomes 'delivered' and stock
-- is reconciled to the loaded quantities (same settle as picker completion).
CREATE OR REPLACE FUNCTION public.driver_mark_delivered(
  p_load_id uuid,
  p_driver_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_load public.delivery_loads%ROWTYPE;
  v_invoice_id uuid;
  v_now timestamptz := now();
  v_all_done boolean;
BEGIN
  SELECT * INTO v_load FROM public.delivery_loads WHERE id = p_load_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Load not found.' USING ERRCODE = 'P0002';
  END IF;
  IF v_load.assigned_driver_id IS DISTINCT FROM p_driver_id THEN
    RAISE EXCEPTION 'This load is not assigned to you.' USING ERRCODE = '42501';
  END IF;

  v_invoice_id := v_load.invoice_id;

  -- Complete the load if it isn't already.
  IF v_load.status <> 'completed' THEN
    UPDATE public.delivery_loads
       SET status = 'completed', completed_at = v_now
     WHERE id = p_load_id;
  END IF;

  -- Are there any loads for this invoice that aren't completed yet?
  SELECT NOT EXISTS (
    SELECT 1 FROM public.delivery_loads
     WHERE invoice_id = v_invoice_id
       AND status <> 'completed'
  ) INTO v_all_done;

  IF v_all_done THEN
    UPDATE public.invoices
       SET picking_status = 'delivered',
           picking_delivered_at = v_now
     WHERE id = v_invoice_id
       AND picking_status <> 'delivered';

    -- Settle tracked stock to what actually left the yard.
    PERFORM public.reconcile_invoice_stock_from_loads(v_invoice_id);
  END IF;

  RETURN jsonb_build_object(
    'invoice_id', v_invoice_id,
    'delivered', v_all_done
  );
END;
$$;

-- Lock down: only the service role (our server actions) may call these.
REVOKE EXECUTE ON FUNCTION public.assign_driver_to_load(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.unassign_driver_from_load(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.driver_mark_delivered(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assign_driver_to_load(uuid, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.unassign_driver_from_load(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.driver_mark_delivered(uuid, uuid) TO service_role;
