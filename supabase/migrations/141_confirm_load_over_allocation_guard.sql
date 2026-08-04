-- =============================================================================
-- 141_confirm_load_over_allocation_guard.sql
-- =============================================================================
-- Two pickers could each hold an OPEN load for the same order (open loads are
-- keyed per picker), each validating against only committed (printed/
-- completed) loads. Both confirms then succeeded because confirm_load clamped
-- over-allocation with GREATEST(..., 0) instead of rejecting it — printing
-- loads whose combined quantities exceeded what was ordered.
--
-- Fix:
--   1. Lock the invoice row (same serialization point save_pick_state uses),
--      so concurrent confirms run one at a time.
--   2. Reject over-allocation explicitly: if committed loads (including the
--      one being confirmed) account for more than a line's ordered quantity,
--      raise instead of clamping.
-- =============================================================================

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

  -- Serialize concurrent confirms for the same order (this is the same lock
  -- save_pick_state takes), so the over-allocation check below always sees
  -- every previously committed load.
  PERFORM 1 FROM public.invoices WHERE id = p_invoice_id FOR UPDATE;

  -- Enforce the per-order load cap (0 = unlimited, missing row = default 5).
  -- Only committed (printed/completed) loads count — abandoned open drafts
  -- are ephemeral and must not block real loads. The open load being
  -- confirmed is excluded from the count (it is about to become printed).
  SELECT max_loads_per_order INTO v_max_loads
    FROM public.company_settings
   WHERE id = 1;

  v_max_loads := COALESCE(v_max_loads, 5);

  IF v_max_loads > 0 THEN
    SELECT COUNT(*) INTO v_load_count
      FROM public.delivery_loads
     WHERE invoice_id = p_invoice_id
       AND status IN ('printed', 'completed');

    IF v_load_count >= v_max_loads THEN
      RAISE EXCEPTION 'LOAD_LIMIT_REACHED:%', v_max_loads USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- A load must account for at least one line — either loaded items or
  -- out-of-stock rows (an all-out-of-stock load is valid: nothing went on
  -- the vehicle, but the order is fully accounted for, matching the office
  -- load path which allows OOS-only loads).
  SELECT COUNT(*) INTO v_loaded_count
    FROM public.delivery_load_items
   WHERE load_id = p_load_id;

  IF v_loaded_count = 0 THEN
    RAISE EXCEPTION 'LOAD_NO_ITEMS' USING ERRCODE = 'P0001';
  END IF;

  -- Remaining quantity across all invoice lines, counting committed
  -- (printed/completed) loads plus this load's own rows (it is about to
  -- become printed, so its contents are committed by this call).
  v_total_remaining := 0;
  FOR v_line IN
    SELECT id, quantity FROM public.invoice_items
     WHERE invoice_id = p_invoice_id
       AND deleted_at IS NULL
  LOOP
    SELECT COALESCE(SUM(dli.quantity), 0) INTO v_accounted
      FROM public.delivery_load_items dli
      JOIN public.delivery_loads dl ON dl.id = dli.load_id
     WHERE dli.invoice_item_id = v_line.id
       AND (dl.status IN ('printed', 'completed') OR dl.id = p_load_id);

    -- Reject over-allocation instead of clamping: committed loads must never
    -- account for more than was ordered (0.0005 epsilon for numeric(12,3)
    -- rounding).
    IF v_accounted > v_line.quantity + 0.0005 THEN
      RAISE EXCEPTION 'LOAD_OVER_ALLOCATED:%', v_line.id USING ERRCODE = 'P0001';
    END IF;

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
  'Atomically confirm (print) a picker open load: enforces the per-order load cap, serializes on the invoice row, rejects over-allocation, and advances the invoice picking status. SECURITY DEFINER so it does not depend on table grants.';
