-- Fix stock-routing edge cases discovered during picker/stock verification.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Status-change trigger must not restore stock on payment/overdue.
--    Stock should only be restored when the invoice is genuinely reversed
--    (draft, cancelled, write_off).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_invoice_stock_on_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Deduct when moving to 'sent' (invoices only, never quotations).
  IF NEW.type = 'invoice' AND OLD.status <> 'sent' AND NEW.status = 'sent' THEN
    PERFORM public.deduct_invoice_stock(NEW.id);
    PERFORM public.raise_low_stock_alerts(NEW.id);
  END IF;

  -- Restore only when the invoice is being reversed, not when it is paid or
  -- becomes overdue.
  IF OLD.type = 'invoice'
     AND OLD.status = 'sent'
     AND NEW.status IN ('draft', 'cancelled', 'write_off')
  THEN
    PERFORM public.restore_invoice_stock(NEW.id);
  END IF;

  RETURN NEW;
END;
$$;

-- Guard the stock-deduction helper itself so any direct call (create/edit
-- actions, the AFTER INSERT trigger, or manual SQL) is a no-op for quotations.
CREATE OR REPLACE FUNCTION public.deduct_invoice_stock(p_invoice_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enable_stock boolean;
  v_type text;
BEGIN
  SELECT enable_stock_routing INTO v_enable_stock
    FROM public.company_settings
   WHERE id = 1;

  IF v_enable_stock IS NOT TRUE THEN
    RETURN;
  END IF;

  SELECT type INTO v_type FROM public.invoices WHERE id = p_invoice_id;
  IF v_type IS DISTINCT FROM 'invoice' THEN
    RETURN;
  END IF;

  UPDATE public.products p
     SET stock_quantity = p.stock_quantity - ii.quantity
    FROM public.invoice_items ii
   WHERE ii.invoice_id = p_invoice_id
     AND ii.product_id = p.id
     AND p.track_stock = true
     AND ii.stock_deducted = 0;

  UPDATE public.invoice_items ii
     SET stock_deducted = ii.quantity
   WHERE ii.invoice_id = p_invoice_id
     AND ii.product_id IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM public.products p
       WHERE p.id = ii.product_id AND p.track_stock = true
     )
     AND ii.stock_deducted = 0;
END;
$$;

-- The AFTER INSERT trigger added in 112 fires before line items exist, so it
-- never deducts on its own; keep it but make it quotation-safe.
CREATE OR REPLACE FUNCTION public.handle_invoice_stock_on_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.type = 'invoice' AND NEW.status = 'sent' THEN
    PERFORM public.deduct_invoice_stock(NEW.id);
    PERFORM public.raise_low_stock_alerts(NEW.id);
  END IF;

  RETURN NEW;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Low-stock alert helper should only alert for lines that actually changed
--    stock in this invoice, not every tracked line on the document.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.raise_low_stock_alerts(p_invoice_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enable_stock boolean;
BEGIN
  SELECT enable_stock_routing INTO v_enable_stock
    FROM public.company_settings
   WHERE id = 1;

  IF v_enable_stock IS NOT TRUE THEN
    RETURN;
  END IF;

  INSERT INTO public.stock_audit_alerts
    (product_id, invoice_item_id, invoice_id, alert_type, source, quantity_needed, raised_by, notes, status)
  SELECT
    p.id,
    ii.id,
    p_invoice_id,
    'low_stock',
    'system',
    ii.quantity,
    (SELECT created_by FROM public.invoices WHERE id = p_invoice_id),
    'Stock fell to ' || p.stock_quantity || ' (reorder level ' || p.reorder_level || ')',
    'open'
  FROM public.invoice_items ii
  JOIN public.products p ON p.id = ii.product_id
  WHERE ii.invoice_id = p_invoice_id
    AND p.track_stock = true
    AND p.reorder_level > 0
    AND p.stock_quantity <= p.reorder_level
    AND ii.stock_deducted > 0
    AND NOT EXISTS (
      SELECT 1 FROM public.stock_audit_alerts sa
      WHERE sa.invoice_id = p_invoice_id
        AND sa.invoice_item_id = ii.id
        AND sa.alert_type = 'low_stock'
        AND sa.source = 'system'
        AND sa.status = 'open'
    );
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Payment trigger must not mark in-progress/partially-loaded orders
--    delivered just because they are paid.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.recompute_invoice_paid()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice_id uuid := COALESCE(NEW.invoice_id, OLD.invoice_id);
  v_paid numeric;
  v_total numeric;
  v_current_status text;
  v_new_status text;
  v_picking_status text;
BEGIN
  IF v_invoice_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(SUM(amount), 0)
    INTO v_paid
    FROM public.payments
   WHERE invoice_id = v_invoice_id;

  SELECT total, status, picking_status
    INTO v_total, v_current_status, v_picking_status
    FROM public.invoices
   WHERE id = v_invoice_id;

  v_new_status := CASE
    WHEN v_total IS NULL THEN v_current_status
    WHEN v_total > 0 AND v_paid >= v_total THEN 'paid'
    WHEN v_paid > 0 THEN 'partial'
    WHEN v_current_status = 'draft' THEN 'draft'
    ELSE 'sent'
  END;

  UPDATE public.invoices
     SET amount_paid = v_paid,
         status = v_new_status,
         picking_status = CASE
           WHEN v_new_status = 'paid'
                AND v_picking_status IN ('loaded', 'completed')
                AND picking_status <> 'delivered'
             THEN 'delivered'
           ELSE picking_status
         END,
         picking_delivered_at = CASE
           WHEN v_new_status = 'paid'
                AND v_picking_status IN ('loaded', 'completed')
                AND picking_status <> 'delivered'
             THEN now()
           ELSE picking_delivered_at
         END,
         updated_at = now()
   WHERE id = v_invoice_id;

  RETURN NULL;
END;
$$;
