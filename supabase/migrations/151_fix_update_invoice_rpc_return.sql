-- =============================================================================
-- Migration 151: Fix update_invoice_with_items "Database schema is out of sync"
-- =============================================================================
--
-- Symptom: editing an invoice fails with SQLSTATE 42601
--   "subquery must return only one column"
-- which the app surfaces as "Database schema is out of sync".
--
-- Cause: `RETURN (SELECT * FROM public.invoices WHERE id = …)` is a scalar
-- subquery. When the function's composite return type drifts from the live
-- invoices row (or Postgres treats SELECT * as multi-column), the call fails.
--
-- Fix:
--   1. Recreate the RPC with a robust `SELECT * INTO row; RETURN row` pattern.
--   2. Authorise staff who have invoices_edit (not only owner/admin), matching
--      the app-level permission check.
-- Fully idempotent.
-- =============================================================================

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
  v_result public.invoices;
  v_is_admin boolean;
  v_can_edit boolean;
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
  v_can_edit := public.has_staff_permission('invoices_edit');

  -- Owner, admin, or staff with invoices_edit may update.
  IF v_existing.created_by IS DISTINCT FROM auth.uid()
     AND NOT v_is_admin
     AND NOT v_can_edit THEN
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

  -- Robust return: SELECT * INTO a composite avoids
  -- "subquery must return only one column" from RETURN (SELECT * …).
  SELECT * INTO v_result FROM public.invoices WHERE id = p_invoice_id;
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.update_invoice_with_items(uuid, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_invoice_with_items(uuid, uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_invoice_with_items(uuid, uuid, jsonb) TO service_role;

COMMENT ON FUNCTION public.update_invoice_with_items(uuid, uuid, jsonb) IS
  'Atomically update invoice header + replace items. Status applied last; stock restore/deduct inside. Returns row via SELECT INTO (schema-safe).';
