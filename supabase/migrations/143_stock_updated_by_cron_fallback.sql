-- =============================================================================
-- 143_stock_updated_by_cron_fallback.sql
-- =============================================================================
-- reconcile_invoice_stock_from_loads wrote stock_updated_by = auth.uid(),
-- which is NULL when the function runs under pg_cron (auto_deliver_stale_loads
-- / check_delivery_alerts) — no JWT claims exist there, leaving an attribution
-- gap on products. Falls back to the invoice's created_by so the column always
-- names a responsible user. Body otherwise identical to migration 130.
-- =============================================================================

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
           -- auth.uid() is NULL under pg_cron; fall back to the invoice owner.
           stock_updated_by = COALESCE(auth.uid(), v_invoice.created_by)
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
