-- =============================================================================
-- Migration 130: Delivery status workflow + invoice-update RPC repair
-- =============================================================================
--
-- Two goals:
--
-- 1. REPAIR (fixes "Database schema is out of sync" on invoice edit / status
--    change): recreate the full stock-routing function + trigger chain and the
--    update_invoice_with_items RPC at their latest known-good bodies
--    (migrations 110/112/115/117/119/121). If the live database missed any of
--    those migrations (e.g. deduct_invoice_stock does not exist → 42883), this
--    one file restores everything. Fully idempotent.
--
-- 2. DELIVERY WORKFLOW: a paid invoice means the goods have left the yard.
--    recompute_invoice_paid now marks the order delivered whenever the invoice
--    becomes paid (previously only when picking was loaded/completed), and a
--    one-off backfill marks every already-paid invoice as delivered.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- A. Stock helpers (latest bodies from migration 117 — with auth gates)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.deduct_invoice_stock(p_invoice_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enable_stock boolean;
  v_type text;
  v_status text;
BEGIN
  IF auth.role() <> 'service_role' THEN
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
    END IF;
    IF NOT (
      public.has_staff_permission('invoices_add')
      OR public.has_staff_permission('invoices_edit')
      OR public.has_staff_permission('invoices_change_status')
      OR public.has_staff_permission('invoices_delete')
      OR public.has_staff_permission('invoices_record_payment')
      OR public.has_staff_permission('invoices_delete_payment')
    ) THEN
      RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT enable_stock_routing INTO v_enable_stock
    FROM public.company_settings
   WHERE id = 1;

  IF v_enable_stock IS NOT TRUE THEN
    RETURN;
  END IF;

  SELECT type, status INTO v_type, v_status FROM public.invoices WHERE id = p_invoice_id;
  IF v_type IS DISTINCT FROM 'invoice' THEN
    RETURN;
  END IF;
  IF v_status IS DISTINCT FROM 'sent' THEN
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

CREATE OR REPLACE FUNCTION public.restore_invoice_stock(p_invoice_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enable_stock boolean;
BEGIN
  IF auth.role() <> 'service_role' THEN
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
    END IF;
    IF NOT (
      public.has_staff_permission('invoices_add')
      OR public.has_staff_permission('invoices_edit')
      OR public.has_staff_permission('invoices_change_status')
      OR public.has_staff_permission('invoices_delete')
      OR public.has_staff_permission('invoices_record_payment')
      OR public.has_staff_permission('invoices_delete_payment')
    ) THEN
      RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT enable_stock_routing INTO v_enable_stock
    FROM public.company_settings
   WHERE id = 1;

  IF v_enable_stock IS NOT TRUE THEN
    RETURN;
  END IF;

  UPDATE public.products p
     SET stock_quantity = p.stock_quantity + ii.stock_deducted
    FROM public.invoice_items ii
   WHERE ii.invoice_id = p_invoice_id
     AND ii.product_id = p.id
     AND p.track_stock = true
     AND ii.stock_deducted > 0;

  UPDATE public.invoice_items ii
     SET stock_deducted = 0
   WHERE ii.invoice_id = p_invoice_id
     AND ii.stock_deducted > 0;
END;
$$;

CREATE OR REPLACE FUNCTION public.raise_low_stock_alerts(p_invoice_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enable_stock boolean;
BEGIN
  IF auth.role() <> 'service_role' THEN
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
    END IF;
    IF NOT (
      public.has_staff_permission('invoices_add')
      OR public.has_staff_permission('invoices_edit')
      OR public.has_staff_permission('invoices_change_status')
      OR public.has_staff_permission('invoices_delete')
      OR public.has_staff_permission('invoices_record_payment')
      OR public.has_staff_permission('invoices_delete_payment')
    ) THEN
      RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
    END IF;
  END IF;

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
-- B. Stock triggers + trigger functions (115 / 121 bodies)
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

  -- Restore only when the invoice is genuinely reversed, not when it is paid
  -- or becomes overdue.
  IF OLD.type = 'invoice'
     AND OLD.status = 'sent'
     AND NEW.status IN ('draft', 'cancelled', 'write_off')
  THEN
    PERFORM public.restore_invoice_stock(NEW.id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS invoices_stock_status_trigger ON public.invoices;
CREATE TRIGGER invoices_stock_status_trigger
  AFTER UPDATE OF status ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.handle_invoice_stock_on_status_change();

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

DROP TRIGGER IF EXISTS invoices_stock_insert_trigger ON public.invoices;
CREATE TRIGGER invoices_stock_insert_trigger
  AFTER INSERT ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.handle_invoice_stock_on_insert();

CREATE OR REPLACE FUNCTION public.handle_invoice_stock_on_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.type = 'invoice' AND EXISTS (
      SELECT 1 FROM public.invoice_items ii
      WHERE ii.invoice_id = OLD.id AND ii.stock_deducted > 0
    ) THEN
      PERFORM public.restore_invoice_stock(OLD.id);
    END IF;
    RETURN OLD;
  END IF;

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

DROP TRIGGER IF EXISTS invoices_stock_on_soft_delete ON public.invoices;
CREATE TRIGGER invoices_stock_on_soft_delete
  AFTER UPDATE OF deleted_at ON public.invoices
  FOR EACH ROW
  WHEN (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL)
  EXECUTE FUNCTION public.handle_invoice_stock_on_delete();

DROP TRIGGER IF EXISTS invoices_stock_on_delete ON public.invoices;
CREATE TRIGGER invoices_stock_on_delete
  BEFORE DELETE ON public.invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_invoice_stock_on_delete();

-- ─────────────────────────────────────────────────────────────────────────────
-- C. reconcile_invoice_stock_from_loads (121 body — used by mark delivered)
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

    v_target := LEAST(GREATEST(v_loaded, 0), v_line.line_qty);
    v_previous := COALESCE(v_line.stock_deducted, 0);
    v_delta := v_previous - v_target;

    IF v_delta = 0 THEN
      CONTINUE;
    END IF;

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

-- ─────────────────────────────────────────────────────────────────────────────
-- D. update_invoice_with_items (119 body — stock-safe ordering)
-- ─────────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.update_invoice_with_items(uuid, uuid, jsonb);

CREATE FUNCTION public.update_invoice_with_items(
  p_invoice_id uuid,
  p_user_id uuid,
  p_payload jsonb
) RETURNS public.invoices
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing public.invoices;
  v_is_admin boolean;
  v_item jsonb;
  v_sort integer := 0;
  v_new_status text;
  v_new_type text;
BEGIN
  SELECT * INTO v_existing FROM public.invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT public.is_admin() INTO v_is_admin;
  IF v_existing.created_by <> auth.uid() AND NOT v_is_admin THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  v_new_status := COALESCE(NULLIF(p_payload->>'status', ''), v_existing.status);
  v_new_type := COALESCE(NULLIF(p_payload->>'type', ''), v_existing.type);

  -- 1. Metadata only — deliberately leave `status` unchanged so the stock
  --    status trigger does not fire against the soon-to-be-deleted lines.
  UPDATE public.invoices SET
    client_id              = COALESCE(NULLIF(p_payload->>'client_id', '')::uuid, client_id),
    type                   = COALESCE(NULLIF(p_payload->>'type', ''), type),
    document_number        = CASE
                               WHEN p_payload ? 'document_number'
                                 THEN NULLIF(p_payload->>'document_number', '')
                               ELSE document_number
                             END,
    issue_date             = COALESCE(NULLIF(p_payload->>'issue_date', '')::date, issue_date),
    issue_time             = CASE
                               WHEN p_payload ? 'issue_time' THEN NULLIF(p_payload->>'issue_time', '')::time
                               ELSE issue_time
                             END,
    due_date               = NULLIF(p_payload->>'due_date', '')::date,
    expiry_date            = NULLIF(p_payload->>'expiry_date', '')::date,
    order_number           = CASE
                               WHEN p_payload ? 'order_number'
                                 THEN NULLIF(p_payload->>'order_number', '')
                               ELSE order_number
                             END,
    account_number         = CASE
                               WHEN p_payload ? 'account_number'
                                 THEN NULLIF(p_payload->>'account_number', '')
                               ELSE account_number
                             END,
    operator_name          = COALESCE(NULLIF(p_payload->>'operator_name', ''), operator_name),
    your_reference         = NULLIF(p_payload->>'your_reference', ''),
    notes                  = NULLIF(p_payload->>'notes', ''),
    show_payment_terms     = CASE
                               WHEN p_payload ? 'show_payment_terms'
                                 THEN COALESCE(NULLIF(p_payload->>'show_payment_terms', '')::boolean, show_payment_terms)
                               ELSE show_payment_terms
                             END,
    show_watermark         = CASE
                               WHEN p_payload ? 'show_watermark'
                                 THEN COALESCE(NULLIF(p_payload->>'show_watermark', '')::boolean, show_watermark)
                               ELSE show_watermark
                             END,
    show_paid_watermark    = CASE
                               WHEN p_payload ? 'show_paid_watermark'
                                 THEN COALESCE(NULLIF(p_payload->>'show_paid_watermark', '')::boolean, show_paid_watermark)
                               ELSE show_paid_watermark
                             END,
    show_partially_paid_watermark = CASE
                               WHEN p_payload ? 'show_partially_paid_watermark'
                                 THEN COALESCE(NULLIF(p_payload->>'show_partially_paid_watermark', '')::boolean, show_partially_paid_watermark)
                               ELSE show_partially_paid_watermark
                             END,
    show_overdue_watermark = CASE
                               WHEN p_payload ? 'show_overdue_watermark'
                                 THEN COALESCE(NULLIF(p_payload->>'show_overdue_watermark', '')::boolean, show_overdue_watermark)
                               ELSE show_overdue_watermark
                             END,
    status_stamps_enabled  = CASE
                               WHEN p_payload ? 'status_stamps_enabled'
                                 THEN COALESCE(NULLIF(p_payload->>'status_stamps_enabled', '')::boolean, status_stamps_enabled)
                               ELSE status_stamps_enabled
                             END,
    status_stamps_mode     = CASE
                               WHEN p_payload ? 'status_stamps_mode'
                                 THEN COALESCE(NULLIF(p_payload->>'status_stamps_mode', ''), status_stamps_mode)
                               ELSE status_stamps_mode
                             END,
    -- status intentionally NOT updated here
    delivery_method        = COALESCE(NULLIF(p_payload->>'delivery_method', ''), delivery_method),
    delivery_address_line_1 = NULLIF(p_payload->>'delivery_address_line_1', ''),
    delivery_address_line_2 = NULLIF(p_payload->>'delivery_address_line_2', ''),
    delivery_town          = NULLIF(p_payload->>'delivery_town', ''),
    delivery_county        = NULLIF(p_payload->>'delivery_county', ''),
    delivery_postcode      = UPPER(NULLIF(p_payload->>'delivery_postcode', '')),
    discount_amount        = CASE
                               WHEN p_payload ? 'discount_amount'
                                 THEN NULLIF(p_payload->>'discount_amount', '')::numeric
                               ELSE discount_amount
                             END,
    discount_percent       = CASE
                               WHEN p_payload ? 'discount_percent'
                                 THEN NULLIF(p_payload->>'discount_percent', '')::numeric
                               ELSE discount_percent
                             END,
    subtotal               = (p_payload->>'subtotal')::numeric,
    vat_total              = (p_payload->>'vat_total')::numeric,
    total                  = (p_payload->>'total')::numeric,
    updated_at             = now()
  WHERE id = p_invoice_id;

  -- 2. If this is already a sent invoice, put stock back before wiping lines.
  IF v_existing.type = 'invoice' AND v_existing.status = 'sent' THEN
    PERFORM public.restore_invoice_stock(p_invoice_id);
  END IF;

  -- 3. Replace line items atomically.
  DELETE FROM public.invoice_items WHERE invoice_id = p_invoice_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_payload->'items', '[]'::jsonb))
  LOOP
    INSERT INTO public.invoice_items (
      invoice_id, product_id, product_name, product_code, unit,
      quantity, price, vat_rate, vat_amount, line_total, sort_order,
      discount_amount, discount_percent
    ) VALUES (
      p_invoice_id,
      NULLIF(v_item->>'product_id', '')::uuid,
      v_item->>'product_name',
      NULLIF(v_item->>'product_code', ''),
      COALESCE(NULLIF(v_item->>'unit', ''), 'EA'),
      (v_item->>'quantity')::numeric,
      (v_item->>'price')::numeric,
      (v_item->>'vat_rate')::numeric,
      (v_item->>'vat_amount')::numeric,
      (v_item->>'line_total')::numeric,
      v_sort,
      NULLIF(v_item->>'discount_amount', '')::numeric,
      NULLIF(v_item->>'discount_percent', '')::numeric
    );
    v_sort := v_sort + 1;
  END LOOP;

  -- 4. Apply status last so draft→sent deducts against the NEW lines only.
  IF v_new_status IS DISTINCT FROM v_existing.status THEN
    UPDATE public.invoices
       SET status = v_new_status,
           updated_at = now()
     WHERE id = p_invoice_id;
  ELSIF v_existing.type = 'invoice'
        AND v_existing.status = 'sent'
        AND v_new_status = 'sent'
        AND v_new_type = 'invoice' THEN
    -- 5. Stayed sent: restore already ran; deduct once for the new lines.
    PERFORM public.deduct_invoice_stock(p_invoice_id);
    PERFORM public.raise_low_stock_alerts(p_invoice_id);
  END IF;

  RETURN (SELECT * FROM public.invoices WHERE id = p_invoice_id);
END;
$$;

COMMENT ON FUNCTION public.update_invoice_with_items(uuid, uuid, jsonb) IS
  'Atomically update invoice header + replace items. Status applied last; stock restore/deduct is handled inside the function so app-layer double-deduct is not required.';

-- ─────────────────────────────────────────────────────────────────────────────
-- E. recompute_invoice_paid — paid means delivered.
--    When a payment flips the invoice to 'paid', mark the order delivered
--    (unless it was already delivered). Previously this only happened when
--    picking was 'loaded'/'completed'; the business rule is now: paid = goods
--    have gone out.
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
         -- Paid invoice = goods delivered (unless already marked delivered).
         picking_status = CASE
           WHEN v_new_status = 'paid'
                AND picking_status IS DISTINCT FROM 'delivered'
             THEN 'delivered'
           ELSE picking_status
         END,
         picking_delivered_at = CASE
           WHEN v_new_status = 'paid'
                AND picking_status IS DISTINCT FROM 'delivered'
             THEN now()
           ELSE picking_delivered_at
         END,
         updated_at = now()
   WHERE id = v_invoice_id;

  RETURN NULL;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- F. Backfill: every already-paid invoice is delivered.
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE public.invoices
   SET picking_status = 'delivered',
       picking_delivered_at = COALESCE(picking_delivered_at, now()),
       updated_at = now()
 WHERE type = 'invoice'
   AND status = 'paid'
   AND picking_status IS DISTINCT FROM 'delivered'
   AND deleted_at IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- G. Grants (matches 117/123 least-privilege state)
-- ─────────────────────────────────────────────────────────────────────────────

REVOKE EXECUTE ON FUNCTION public.deduct_invoice_stock(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.restore_invoice_stock(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.raise_low_stock_alerts(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.reconcile_invoice_stock_from_loads(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.deduct_invoice_stock(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.restore_invoice_stock(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.raise_low_stock_alerts(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reconcile_invoice_stock_from_loads(uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.handle_invoice_stock_on_insert() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_invoice_stock_on_delete() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_invoice_stock_on_status_change() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recompute_invoice_paid() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_invoice_stock_on_insert() TO service_role;
GRANT EXECUTE ON FUNCTION public.handle_invoice_stock_on_delete() TO service_role;
GRANT EXECUTE ON FUNCTION public.handle_invoice_stock_on_status_change() TO service_role;
GRANT EXECUTE ON FUNCTION public.recompute_invoice_paid() TO service_role;

REVOKE ALL ON FUNCTION public.update_invoice_with_items(uuid, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_invoice_with_items(uuid, uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_invoice_with_items(uuid, uuid, jsonb) TO service_role;
