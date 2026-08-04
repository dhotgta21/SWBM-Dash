-- =============================================================================
-- 136_picker_completed_means_loaded.sql
-- =============================================================================
-- Status-semantics fix: picker "Order completed" means the order is fully
-- LOADED onto the vehicle — NOT delivered. The original mark_order_completed
-- (migration 134) also set the delivery loads to 'completed', and the driver
-- app treats completed loads as delivered, so every order the picker finished
-- vanished from the driver queue and showed up in driver history as
-- "Delivered" even though nothing had left the yard.
--
-- Correct lifecycle:
--   load:        open -> printed (picker printed) -> completed (DRIVER
--                delivered, office override, or the 135 auto-deliver sweep)
--   invoice:     ... -> 'loaded' (load printed) -> 'completed' (picker says
--                fully loaded) -> 'delivered' (all loads delivered)
--
-- This migration:
--   1. Replaces mark_order_completed so it no longer touches delivery_loads
--      (loads stay 'printed' for the driver). Stock is still reconciled to
--      the loaded quantities — reconcile_invoice_stock_from_loads counts
--      'printed' AND 'completed' loads, so the settle is unchanged.
--   2. Repairs existing data: loads marked 'completed' by the old picker
--      path (their invoice is 'completed', not 'delivered') go back to
--      'printed' so they reappear in the driver queue. Loads on invoices
--      already 'delivered' are genuinely delivered and stay completed.
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

  -- Nothing may remain unaccounted for (open draft loads count too).
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
  'Marks a fully loaded invoice order as completed (loaded onto the vehicle). Loads stay printed until the driver delivers them. SECURITY DEFINER so it does not depend on table grants.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Data repair: loads wrongly completed by the old picker path. Their invoice
-- is 'completed' (loaded) but NOT 'delivered', so they were never actually
-- delivered — send them back to 'printed' so the driver sees the job.
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE public.delivery_loads dl
   SET status = 'printed',
       completed_at = NULL
  FROM public.invoices i
 WHERE i.id = dl.invoice_id
   AND dl.status = 'completed'
   AND i.picking_status = 'completed';
