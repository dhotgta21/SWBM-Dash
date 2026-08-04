-- =============================================================================
-- 147 — Fix concurrent last-load completion race in driver_mark_delivered
-- =============================================================================
-- Problem: the RPC locked only the single load row (FOR UPDATE) and then
-- checked NOT EXISTS (... status <> 'completed') under READ COMMITTED. Two
-- drivers completing the final two loads of the same invoice concurrently
-- each saw the other's load as still uncommitted, so neither marked the
-- invoice delivered nor reconciled stock — and nothing self-heals (the
-- auto-deliver sweep and overdue alerts only consider printed loads).
--
-- Fix: lock the parent invoice row FOR UPDATE before completing the load.
-- Concurrent deliveries of the same invoice now serialize: the second
-- transaction waits for the first to commit and then re-evaluates the
-- all-done check against the committed state.
-- =============================================================================

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
  v_invoice_deleted_at timestamptz;
BEGIN
  SELECT * INTO v_load FROM public.delivery_loads WHERE id = p_load_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Load not found.' USING ERRCODE = 'P0002';
  END IF;
  IF v_load.assigned_driver_id IS DISTINCT FROM p_driver_id THEN
    RAISE EXCEPTION 'This load is not assigned to you.' USING ERRCODE = '42501';
  END IF;
  IF v_load.status NOT IN ('printed', 'completed') THEN
    RAISE EXCEPTION 'Only printed or completed loads can be marked as delivered.' USING ERRCODE = 'P0001';
  END IF;

  v_invoice_id := v_load.invoice_id;

  -- Lock the invoice row: serializes concurrent deliveries of this invoice
  -- so the all-done check below observes committed load states only.
  SELECT deleted_at INTO v_invoice_deleted_at FROM public.invoices
   WHERE id = v_invoice_id FOR UPDATE;
  IF NOT FOUND OR v_invoice_deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'This order has been removed and can no longer be delivered.' USING ERRCODE = 'P0002';
  END IF;

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
