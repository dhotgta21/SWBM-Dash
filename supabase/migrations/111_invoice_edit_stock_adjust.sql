-- Migration 111: reconcile stock when a sent invoice is edited without a status change.
--
-- The `update_invoice_with_items` RPC deletes and re-inserts line items on every
-- edit. The status-change trigger handles draft→sent and sent→draft, but when an
-- invoice stays sent the trigger does not fire and stock would drift. This
-- migration replaces `adjust_invoice_item_stock` so it also updates the
-- `stock_deducted` column on the new invoice items, keeping the restore path
-- correct if the invoice is later deleted or moved back to draft.

CREATE OR REPLACE FUNCTION public.adjust_invoice_item_stock(
  p_invoice_id uuid,
  p_old_items jsonb,
  p_new_items jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enable_stock boolean;
  v_item jsonb;
BEGIN
  SELECT enable_stock_routing INTO v_enable_stock
    FROM public.company_settings
   WHERE id = 1;

  IF v_enable_stock IS NOT TRUE THEN
    RETURN;
  END IF;

  -- Restore old quantities for tracked products.
  FOR v_item IN SELECT jsonb_array_elements(p_old_items)
  LOOP
    UPDATE public.products p
       SET stock_quantity = p.stock_quantity + (v_item->>'stock_deducted')::numeric
     WHERE p.id = (v_item->>'product_id')::uuid
       AND p.track_stock = true
       AND (v_item->>'stock_deducted')::numeric > 0;
  END LOOP;

  -- Deduct new quantities for tracked products.
  FOR v_item IN SELECT jsonb_array_elements(p_new_items)
  LOOP
    UPDATE public.products p
       SET stock_quantity = p.stock_quantity - (v_item->>'quantity')::numeric
     WHERE p.id = (v_item->>'product_id')::uuid
       AND p.track_stock = true;
  END LOOP;

  -- Record what was deducted so restoration on later delete/status change is exact.
  UPDATE public.invoice_items ii
     SET stock_deducted = ii.quantity
   WHERE ii.invoice_id = p_invoice_id
     AND ii.product_id IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM public.products p
       WHERE p.id = ii.product_id AND p.track_stock = true
     );
END;
$$;
