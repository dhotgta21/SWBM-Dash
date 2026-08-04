-- =============================================================================
-- 137_max_loads_per_order.sql
-- =============================================================================
-- Cap how many loads a single order can be split into (default 5), and let
-- office staff adjust the cap in Settings -> Company ("Deliveries" section,
-- 1-50). A value of 0 means no limit (only reachable via direct SQL).
--
-- The cap is enforced at every point where a NEW load is created:
--   * confirm_load (picker printing a load) — enforced here, in this file
--   * createOfficeLoad / moveLoadItems (office load management) — enforced
--     in the server actions, which read the same setting
-- Existing orders that already exceed the cap are unaffected; the check only
-- blocks creating further loads.
--
-- Idempotent: safe to re-run.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- A. The setting (0 = unlimited)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS max_loads_per_order integer NOT NULL DEFAULT 5;

-- ─────────────────────────────────────────────────────────────────────────────
-- B. confirm_load with the load-count cap (otherwise identical to 133)
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
  v_max_loads integer;
  v_load_count integer;
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

  -- Enforce the per-order load cap (0 = unlimited, missing row = default 5).
  -- The open load being confirmed is excluded from the count — it is the one
  -- becoming the (count + 1)th load.
  SELECT max_loads_per_order INTO v_max_loads
    FROM public.company_settings
   WHERE id = 1;

  v_max_loads := COALESCE(v_max_loads, 5);

  IF v_max_loads > 0 THEN
    SELECT COUNT(*) INTO v_load_count
      FROM public.delivery_loads
     WHERE invoice_id = p_invoice_id
       AND id <> p_load_id;

    IF v_load_count >= v_max_loads THEN
      RAISE EXCEPTION 'LOAD_LIMIT_REACHED:%', v_max_loads USING ERRCODE = 'P0001';
    END IF;
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
  'Atomically confirm (print) a picker open load, enforcing the per-order load cap, and advance the invoice picking status. SECURITY DEFINER so it does not depend on table grants.';
