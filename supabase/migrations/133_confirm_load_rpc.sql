-- =============================================================================
-- 133_confirm_load_rpc.sql
-- =============================================================================
-- Definitive fix for the picker "You are not authorised to perform that
-- action." (42501) error when completing a load.
--
-- confirmLoad previously UPDATEd delivery_loads / invoices directly through
-- the service-role client, which depends on table GRANTs being present.
-- This moves the whole confirm step into a SECURITY DEFINER RPC (runs as the
-- function owner, exactly like save_pick_state in 114), so the load-confirm
-- path no longer depends on table grants at all.
--
-- Also re-asserts the migration-131 grants idempotently so applying this
-- file alone fixes both the confirm path and the (silent) stock_audit_alerts
-- write failures in savePickState / delivery-alerts.
--
-- Idempotent: safe to re-run.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Re-assert service-role write grants (from 131, idempotent)
-- ─────────────────────────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.delivery_loads TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.delivery_load_items TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_audit_alerts TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.delivery_alerts TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. confirm_load — atomically print a picker's open load
--    Returns the load number. Raises friendly exceptions the action layer
--    maps to user-facing messages.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.confirm_load(
  p_invoice_id uuid,
  p_load_id uuid,
  p_picker_id uuid,
  p_is_split boolean
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_load public.delivery_loads%ROWTYPE;
  v_loaded_count integer;
  v_total_remaining numeric(12,3);
  v_line record;
  v_accounted numeric(12,3);
  v_next_picking_status text;
  v_now timestamptz := now();
BEGIN
  -- Caller must be an active picker.
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
     WHERE id = p_picker_id AND role = 'picker' AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Not authorised' USING ERRCODE = '42501';
  END IF;

  -- Lock the load and verify it is confirmable.
  SELECT * INTO v_load
    FROM public.delivery_loads
   WHERE id = p_load_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'LOAD_MISSING' USING ERRCODE = 'P0002';
  END IF;
  IF v_load.invoice_id <> p_invoice_id THEN
    RAISE EXCEPTION 'LOAD_WRONG_INVOICE' USING ERRCODE = 'P0001';
  END IF;
  IF v_load.status <> 'open' THEN
    RAISE EXCEPTION 'LOAD_NOT_OPEN:%', v_load.status USING ERRCODE = 'P0001';
  END IF;
  IF v_load.picked_by IS NOT NULL AND v_load.picked_by <> p_picker_id THEN
    RAISE EXCEPTION 'LOAD_WRONG_PICKER' USING ERRCODE = 'P0001';
  END IF;

  -- A load must contain at least one loaded item.
  SELECT COUNT(*) INTO v_loaded_count
    FROM public.delivery_load_items
   WHERE load_id = p_load_id AND status = 'loaded';

  IF v_loaded_count = 0 THEN
    RAISE EXCEPTION 'LOAD_NO_ITEMS' USING ERRCODE = 'P0001';
  END IF;

  -- Remaining quantity across all invoice lines, counting committed
  -- (printed/completed) loads plus this load's own rows (it is about to
  -- become printed, so its contents are committed by this call).
  v_total_remaining := 0;
  FOR v_line IN
    SELECT id, quantity FROM public.invoice_items WHERE invoice_id = p_invoice_id
  LOOP
    SELECT COALESCE(SUM(dli.quantity), 0) INTO v_accounted
      FROM public.delivery_load_items dli
      JOIN public.delivery_loads dl ON dl.id = dli.load_id
     WHERE dli.invoice_item_id = v_line.id
       AND (dl.status IN ('printed', 'completed') OR dl.id = p_load_id);

    v_total_remaining := v_total_remaining + GREATEST(v_line.quantity - v_accounted, 0);
  END LOOP;

  IF p_is_split AND v_total_remaining > 0 THEN
    v_next_picking_status := 'partially_loaded';
  ELSIF v_total_remaining = 0 THEN
    v_next_picking_status := 'loaded';
  ELSE
    -- Caller said not split but items remain — treat as split to avoid
    -- losing state.
    v_next_picking_status := 'partially_loaded';
  END IF;

  UPDATE public.delivery_loads
     SET status = 'printed', printed_at = v_now
   WHERE id = p_load_id;

  UPDATE public.invoices
     SET picking_status = v_next_picking_status,
         picking_loaded_at = CASE
           WHEN v_next_picking_status = 'loaded' THEN v_now
           ELSE picking_loaded_at
         END
   WHERE id = p_invoice_id;

  RETURN v_load.load_number;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.confirm_load(uuid, uuid, uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_load(uuid, uuid, uuid, boolean) TO service_role;

COMMENT ON FUNCTION public.confirm_load(uuid, uuid, uuid, boolean) IS
  'Atomically confirm (print) a picker open load and advance the invoice picking status. SECURITY DEFINER so it does not depend on table grants.';
