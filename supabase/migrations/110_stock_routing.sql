-- Optional stock-routing module: company-level master switch,
-- per-product stock tracking, and invoice-level stock deduction tracking.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Company-level master switch
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS enable_stock_routing boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.company_settings.enable_stock_routing IS
  'When true, the stock-routing module is active: products can track stock, invoices deduct stock on send, and stock alerts are raised.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Per-product stock fields
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS track_stock boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stock_quantity numeric(12,3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reorder_level numeric(12,3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stock_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS stock_updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.products.track_stock IS
  'Whether this product participates in stock routing. Only meaningful when company_settings.enable_stock_routing is true.';
COMMENT ON COLUMN public.products.stock_quantity IS
  'Current available stock. Deducted when an invoice is sent; restored when a sent invoice is edited/deleted.';
COMMENT ON COLUMN public.products.reorder_level IS
  'Threshold below which a low-stock alert is raised. 0 means no automatic low-stock alert.';

-- Ensure tracked products cannot have negative stock.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'products_stock_quantity_nonnegative'
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_stock_quantity_nonnegative
      CHECK (stock_quantity >= 0);
  END IF;
END $$;

-- Index for stock take list.
CREATE INDEX IF NOT EXISTS idx_products_track_stock
  ON public.products(track_stock)
  WHERE track_stock = true;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Invoice items stock-deducted tracking
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.invoice_items
  ADD COLUMN IF NOT EXISTS stock_deducted numeric(12,3) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.invoice_items.stock_deducted IS
  'How much stock was deducted for this line when the invoice was sent. Used to restore the correct amount on edit/delete.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Stock deduction / restoration helpers
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.deduct_invoice_stock(p_invoice_id uuid)
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

  -- Deduct stock for every tracked product line that has not yet been deducted.
  UPDATE public.products p
     SET stock_quantity = p.stock_quantity - ii.quantity
  FROM public.invoice_items ii
  WHERE ii.invoice_id = p_invoice_id
    AND ii.product_id = p.id
    AND p.track_stock = true
    AND ii.stock_deducted = 0;

  -- Record what we deducted.
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

CREATE OR REPLACE FUNCTION public.restore_invoice_stock(p_invoice_id uuid)
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

  -- Restore stock for tracked product lines that were deducted.
  UPDATE public.products p
     SET stock_quantity = p.stock_quantity + ii.stock_deducted
  FROM public.invoice_items ii
  WHERE ii.invoice_id = p_invoice_id
    AND ii.product_id = p.id
    AND p.track_stock = true
    AND ii.stock_deducted > 0;

  -- Clear the deducted tracking.
  UPDATE public.invoice_items ii
     SET stock_deducted = 0
  WHERE ii.invoice_id = p_invoice_id
    AND ii.stock_deducted > 0;
END;
$$;

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
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Low-stock alert helper
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
-- 6. Trigger on invoice status to deduct/restore stock
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_invoice_stock_on_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Deduct when moving to 'sent'.
  IF OLD.status <> 'sent' AND NEW.status = 'sent' THEN
    PERFORM public.deduct_invoice_stock(NEW.id);
    PERFORM public.raise_low_stock_alerts(NEW.id);
  END IF;

  -- Restore when moving away from 'sent' (e.g. back to draft).
  IF OLD.status = 'sent' AND NEW.status <> 'sent' THEN
    PERFORM public.restore_invoice_stock(NEW.id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS invoices_stock_status_trigger ON public.invoices;
CREATE TRIGGER invoices_stock_status_trigger
  AFTER UPDATE OF status ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.handle_invoice_stock_on_status_change();

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Trigger on invoice deletion (soft delete) to restore stock
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_invoice_stock_on_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL AND OLD.status = 'sent' THEN
    PERFORM public.restore_invoice_stock(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS invoices_stock_delete_trigger ON public.invoices;
CREATE TRIGGER invoices_stock_delete_trigger
  BEFORE UPDATE OF deleted_at ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.handle_invoice_stock_on_delete();

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Update payment trigger to mark delivered when paid
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
BEGIN
  IF v_invoice_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(SUM(amount), 0)
    INTO v_paid
    FROM public.payments
   WHERE invoice_id = v_invoice_id;

  SELECT total, status
    INTO v_total, v_current_status
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
           WHEN v_new_status = 'paid' AND picking_status <> 'delivered' THEN 'delivered'
           ELSE picking_status
         END,
         picking_delivered_at = CASE
           WHEN v_new_status = 'paid' AND picking_status <> 'delivered' THEN now()
           ELSE picking_delivered_at
         END,
         updated_at = now()
   WHERE id = v_invoice_id;

  RETURN NULL;
END;
$$;
