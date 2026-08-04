-- =============================================================================
-- 134_mark_order_completed_rpc.sql
-- =============================================================================
-- Fix the "You are not authorised to perform that action." (42501) error
-- when a picker taps "Confirm completed" (markOrderCompleted).
--
-- markOrderCompleted previously UPDATEd delivery_loads and invoices DIRECTLY through
-- the service-role client. Migration 131 granted write privileges on the
-- load tables, but nothing ever granted service_role any privilege on
-- public.invoices, so the invoice UPDATE failed with 42501 and orders could
-- never be marked completed.
--
-- Same pattern as 133_confirm_load_rpc.sql: move the whole operation into a
-- SECURITY DEFINER function (runs as the function owner, so it does not
-- depend on table GRANTs) and allow only the service role to execute it.
-- All-or-nothing: if the stock reconcile fails, the whole completion rolls
-- back instead of leaving a half-completed order.
--
-- IMPORTANT (corrected in 136): picker "Order completed" means the order is
-- fully LOADED onto the vehicle — it must NOT complete the delivery loads.
-- Loads stay 'printed' until the driver marks them delivered (or the
-- auto-deliver sweep in 135 completes them), otherwise the driver app shows
-- jobs as delivered that never left the yard.
--
-- Idempotent: safe to re-run.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.mark_order_completed(
  p_invoice_id uuid,
  p_picker_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice record;
  v_line record;
  v_accounted numeric(12,3);
  v_total_remaining numeric(12,3) := 0;
  v_now timestamptz := now();
BEGIN
  -- Caller must be an active picker.
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
     WHERE id = p_picker_id
       AND role = 'picker'
       AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Not authorised.' USING ERRCODE = '42501';
  END IF;

  -- Invoice must be a live, fully loaded order awaiting completion.
  SELECT id INTO v_invoice
    FROM public.invoices
   WHERE id = p_invoice_id
     AND type = 'invoice'
     AND picking_status = 'loaded'
     AND status IN ('sent', 'partial')
     AND deleted_at IS NULL
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_COMPLETABLE' USING ERRCODE = 'P0001';
  END IF;

  -- Nothing may remain unaccounted for (open draft loads count too, matching
  -- the previous server-action behaviour).
  FOR v_line IN
    SELECT id, quantity
      FROM public.invoice_items
     WHERE invoice_id = p_invoice_id
  LOOP
    SELECT COALESCE(SUM(dli.quantity), 0) INTO v_accounted
      FROM public.delivery_load_items dli
      JOIN public.delivery_loads dl ON dl.id = dli.load_id
     WHERE dli.invoice_item_id = v_line.id
       AND dl.status IN ('open', 'printed', 'completed');

    v_total_remaining := v_total_remaining + GREATEST(v_line.quantity - v_accounted, 0);
  END LOOP;

  IF v_total_remaining > 0 THEN
    RAISE EXCEPTION 'ITEMS_REMAINING' USING ERRCODE = 'P0001';
  END IF;

  -- Picker completion means LOADED, not delivered: the loads stay 'printed'
  -- so they remain in the driver queue until the driver confirms delivery.
  UPDATE public.invoices
     SET picking_status = 'completed',
         picking_completed_at = v_now
   WHERE id = p_invoice_id;

  -- Settle tracked stock to the LOADED quantities (restore any out-of-stock
  -- remainder that was reserved/deducted when the invoice was sent).
  PERFORM public.reconcile_invoice_stock_from_loads(p_invoice_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.mark_order_completed(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_order_completed(uuid, uuid) TO service_role;

COMMENT ON FUNCTION public.mark_order_completed(uuid, uuid) IS
  'Atomically mark a fully loaded invoice order as completed: completes its printed loads, advances picking_status, and reconciles stock. SECURITY DEFINER so it does not depend on table grants.';
