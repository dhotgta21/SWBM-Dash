-- 121_stock_lifecycle_polish.sql
--
-- Closes the stock + alert lifecycle gaps in existing features:
--   1. reconcile_invoice_stock_from_loads — settle stock to LOADED qty after pick
--   2. Soft-delete restores stock whenever stock_deducted > 0 (not only status=sent)
--   3. Alert order/receive fields (qty ordered, ETA, qty received)
--   4. receive_stock_alert_goods — goods-in: stock_quantity += received
--
-- Per-line updates avoid the multi-line same-product under-deduct bug.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Alert lifecycle columns
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.stock_audit_alerts
  ADD COLUMN IF NOT EXISTS quantity_ordered numeric(12,3),
  ADD COLUMN IF NOT EXISTS expected_delivery_date date,
  ADD COLUMN IF NOT EXISTS quantity_received numeric(12,3),
  ADD COLUMN IF NOT EXISTS received_at timestamptz;

COMMENT ON COLUMN public.stock_audit_alerts.quantity_ordered IS
  'Qty placed with supplier when status=ordered (optional if not tracking numbers).';
COMMENT ON COLUMN public.stock_audit_alerts.expected_delivery_date IS
  'Expected supplier delivery date for ordered goods.';
COMMENT ON COLUMN public.stock_audit_alerts.quantity_received IS
  'Qty received into stock when goods-in is confirmed.';
COMMENT ON COLUMN public.stock_audit_alerts.received_at IS
  'When goods-in was confirmed.';

-- Allow 'received' as a terminal status alongside resolved (received = closed after goods-in).
ALTER TABLE public.stock_audit_alerts
  DROP CONSTRAINT IF EXISTS stock_audit_alerts_status_check;

ALTER TABLE public.stock_audit_alerts
  ADD CONSTRAINT stock_audit_alerts_status_check
  CHECK (status IN ('open', 'ordered', 'resolved', 'received'));

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. reconcile_invoice_stock_from_loads
--    Sets each tracked line's stock_deducted to the sum of LOADED quantities
--    across printed/completed loads, and adjusts products.stock_quantity by
--    the delta from the previous stock_deducted value.
--
--    Example: sent deducted 10; picker loaded 6, OOS 4 → restore 4, stock_deducted=6.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.reconcile_invoice_stock_from_loads(p_invoice_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enable_stock boolean;
  v_invoice public.invoices%ROWTYPE;
  v_line record;
  v_loaded numeric(12,3);
  v_previous numeric(12,3);
  v_target numeric(12,3);
  v_delta numeric(12,3);
  v_lines_adjusted integer := 0;
  v_total_restored numeric(12,3) := 0;
  v_total_deducted numeric(12,3) := 0;
BEGIN
  IF auth.role() <> 'service_role' THEN
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
    END IF;
    -- Operators (invoice lifecycle) or pickers may settle stock for a load.
    IF NOT (
      public.is_admin()
      OR public.has_staff_permission('invoices_add')
      OR public.has_staff_permission('invoices_edit')
      OR public.has_staff_permission('invoices_change_status')
      OR EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid() AND p.role = 'picker' AND p.is_active IS DISTINCT FROM false
      )
    ) THEN
      RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT enable_stock_routing INTO v_enable_stock
    FROM public.company_settings
   WHERE id = 1;

  IF v_enable_stock IS NOT TRUE THEN
    RETURN jsonb_build_object(
      'ok', true,
      'skipped', true,
      'reason', 'stock_routing_disabled',
      'lines_adjusted', 0
    );
  END IF;

  SELECT * INTO v_invoice
    FROM public.invoices
   WHERE id = p_invoice_id
     AND deleted_at IS NULL
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_invoice.type IS DISTINCT FROM 'invoice' THEN
    RETURN jsonb_build_object('ok', true, 'skipped', true, 'reason', 'not_invoice', 'lines_adjusted', 0);
  END IF;

  -- Line-by-line so multi-line same product is correct.
  FOR v_line IN
    SELECT
      ii.id AS invoice_item_id,
      ii.product_id,
      ii.quantity AS line_qty,
      ii.stock_deducted,
      p.track_stock
    FROM public.invoice_items ii
    LEFT JOIN public.products p ON p.id = ii.product_id
    WHERE ii.invoice_id = p_invoice_id
      AND ii.deleted_at IS NULL
      AND ii.product_id IS NOT NULL
      AND p.track_stock = true
    FOR UPDATE OF ii
  LOOP
    SELECT COALESCE(SUM(dli.quantity), 0)
      INTO v_loaded
      FROM public.delivery_load_items dli
      JOIN public.delivery_loads dl ON dl.id = dli.load_id
     WHERE dli.invoice_item_id = v_line.invoice_item_id
       AND dli.status = 'loaded'
       AND dl.status IN ('printed', 'completed');

    -- Never deduct more than the invoice line ordered.
    v_target := LEAST(GREATEST(v_loaded, 0), v_line.line_qty);
    v_previous := COALESCE(v_line.stock_deducted, 0);
    v_delta := v_previous - v_target;
    -- v_delta > 0 → restore to shelf; v_delta < 0 → take more off shelf

    IF v_delta = 0 THEN
      CONTINUE;
    END IF;

    -- Lock product row and apply delta.
    UPDATE public.products p
       SET stock_quantity = p.stock_quantity + v_delta,
           stock_updated_at = now(),
           stock_updated_by = auth.uid()
     WHERE p.id = v_line.product_id
       AND p.track_stock = true;

    UPDATE public.invoice_items
       SET stock_deducted = v_target
     WHERE id = v_line.invoice_item_id;

    v_lines_adjusted := v_lines_adjusted + 1;
    IF v_delta > 0 THEN
      v_total_restored := v_total_restored + v_delta;
    ELSE
      v_total_deducted := v_total_deducted + ABS(v_delta);
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'skipped', false,
    'lines_adjusted', v_lines_adjusted,
    'restored', v_total_restored,
    'deducted', v_total_deducted
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reconcile_invoice_stock_from_loads(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reconcile_invoice_stock_from_loads(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_invoice_stock_from_loads(uuid) TO service_role;

COMMENT ON FUNCTION public.reconcile_invoice_stock_from_loads(uuid) IS
  'Settle tracked stock to sum of LOADED load-item quantities (printed/completed loads). Restores OOS/order remainder if previously deducted at send.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Soft-delete: restore stock whenever any line has stock_deducted > 0
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_invoice_stock_on_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Soft-delete path uses UPDATE deleted_at; hard-delete uses DELETE.
  -- Restore any reserved/deducted stock regardless of lifecycle status
  -- (sent / partial / paid), as long as stock was taken for the document.
  IF TG_OP = 'DELETE' THEN
    IF OLD.type = 'invoice' AND EXISTS (
      SELECT 1 FROM public.invoice_items ii
      WHERE ii.invoice_id = OLD.id AND ii.stock_deducted > 0
    ) THEN
      PERFORM public.restore_invoice_stock(OLD.id);
    END IF;
    RETURN OLD;
  END IF;

  -- Soft-delete: NEW.deleted_at set, OLD.deleted_at null
  IF TG_OP = 'UPDATE'
     AND OLD.deleted_at IS NULL
     AND NEW.deleted_at IS NOT NULL
     AND NEW.type = 'invoice'
     AND EXISTS (
       SELECT 1 FROM public.invoice_items ii
       WHERE ii.invoice_id = NEW.id AND ii.stock_deducted > 0
     )
  THEN
    PERFORM public.restore_invoice_stock(NEW.id);
  END IF;

  RETURN NEW;
END;
$$;

-- Ensure soft-delete path is covered (UPDATE of deleted_at).
DROP TRIGGER IF EXISTS invoices_stock_on_soft_delete ON public.invoices;
CREATE TRIGGER invoices_stock_on_soft_delete
  AFTER UPDATE OF deleted_at ON public.invoices
  FOR EACH ROW
  WHEN (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL)
  EXECUTE FUNCTION public.handle_invoice_stock_on_delete();

-- Keep DELETE trigger if present from 110.
DROP TRIGGER IF EXISTS invoices_stock_on_delete ON public.invoices;
CREATE TRIGGER invoices_stock_on_delete
  BEFORE DELETE ON public.invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_invoice_stock_on_delete();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. mark_stock_alert_ordered — open → ordered with optional qty + ETA
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mark_stock_alert_ordered(
  p_alert_id uuid,
  p_quantity_ordered numeric DEFAULT NULL,
  p_expected_delivery_date date DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  IF NOT (
    public.is_admin()
    OR public.has_staff_permission('products_edit')
  ) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF p_quantity_ordered IS NOT NULL AND p_quantity_ordered < 0 THEN
    RAISE EXCEPTION 'Quantity ordered must be 0 or more' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.stock_audit_alerts
     SET status = 'ordered',
         quantity_ordered = p_quantity_ordered,
         expected_delivery_date = p_expected_delivery_date,
         notes = COALESCE(NULLIF(trim(p_notes), ''), notes),
         resolved_at = NULL,
         resolved_by = NULL
   WHERE id = p_alert_id
     AND status IN ('open', 'ordered');

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_stock_alert_ordered(uuid, numeric, date, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_stock_alert_ordered(uuid, numeric, date, text) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. receive_stock_alert_goods — ordered → received; stock_quantity += qty
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.receive_stock_alert_goods(
  p_alert_id uuid,
  p_quantity_received numeric,
  p_notes text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_alert public.stock_audit_alerts%ROWTYPE;
  v_qty numeric(12,3);
  v_track boolean;
  v_enable_stock boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  IF NOT (
    public.is_admin()
    OR public.has_staff_permission('products_edit')
  ) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF p_quantity_received IS NULL OR p_quantity_received <= 0 THEN
    RAISE EXCEPTION 'Quantity received must be greater than zero' USING ERRCODE = 'P0001';
  END IF;

  v_qty := round(p_quantity_received::numeric, 3);

  SELECT * INTO v_alert
    FROM public.stock_audit_alerts
   WHERE id = p_alert_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Alert not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_alert.status NOT IN ('open', 'ordered') THEN
    RAISE EXCEPTION 'Alert is already closed' USING ERRCODE = 'P0001';
  END IF;

  SELECT enable_stock_routing INTO v_enable_stock
    FROM public.company_settings WHERE id = 1;

  -- Only bump product qty when routing is on and product tracks stock.
  IF v_enable_stock IS TRUE AND v_alert.product_id IS NOT NULL THEN
    SELECT track_stock INTO v_track
      FROM public.products
     WHERE id = v_alert.product_id
     FOR UPDATE;

    IF v_track IS TRUE THEN
      UPDATE public.products
         SET stock_quantity = stock_quantity + v_qty,
             stock_updated_at = now(),
             stock_updated_by = auth.uid()
       WHERE id = v_alert.product_id;
    END IF;
  END IF;

  UPDATE public.stock_audit_alerts
     SET status = 'received',
         quantity_received = v_qty,
         received_at = now(),
         resolved_at = now(),
         resolved_by = auth.uid(),
         notes = COALESCE(NULLIF(trim(p_notes), ''), notes)
   WHERE id = p_alert_id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.receive_stock_alert_goods(uuid, numeric, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.receive_stock_alert_goods(uuid, numeric, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.receive_stock_alert_goods(uuid, numeric, text) IS
  'Confirm supplier goods-in for a stock alert. When stock routing + track_stock are on, increments products.stock_quantity.';
