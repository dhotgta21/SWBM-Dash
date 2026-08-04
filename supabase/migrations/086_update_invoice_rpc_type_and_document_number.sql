-- Migration 086: Allow update_invoice_with_items to change document type and number.
--
-- This migration recreates the update_invoice_with_items RPC so its return
-- type is rebuilt against the current public.invoices row type. Migration 085
-- added share_token_created_at (NOT NULL) after the last RPC recreation in
-- migration 081, which left some database states with a stale composite return
-- type. That stale type caused saves to fail with:
--   "subquery must return only one column" (SQLSTATE 42601)
-- whenever toggles such as "Apply VAT" or "Show payment terms" were changed.
--
-- The recreated function also honours a new `type` and `document_number` in the
-- payload, enabling operators to flip an unpaid draft/sent document between
-- invoice and quotation. document_number is intentionally only written when the
-- key is present, so routine edits keep the original number.

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
BEGIN
  SELECT * INTO v_existing FROM public.invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT public.is_admin() INTO v_is_admin;
  IF v_existing.created_by <> auth.uid() AND NOT v_is_admin THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

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
    status                 = COALESCE(NULLIF(p_payload->>'status', ''), status),
    delivery_method        = COALESCE(NULLIF(p_payload->>'delivery_method', ''), delivery_method),
    delivery_address_line_1 = NULLIF(p_payload->>'delivery_address_line_1', ''),
    delivery_address_line_2 = NULLIF(p_payload->>'delivery_address_line_2', ''),
    delivery_town          = NULLIF(p_payload->>'delivery_town', ''),
    delivery_county        = NULLIF(p_payload->>'delivery_county', ''),
    delivery_postcode      = UPPER(NULLIF(p_payload->>'delivery_postcode', '')),
    subtotal               = (p_payload->>'subtotal')::numeric,
    vat_total              = (p_payload->>'vat_total')::numeric,
    total                  = (p_payload->>'total')::numeric,
    updated_at             = now()
  WHERE id = p_invoice_id;

  DELETE FROM public.invoice_items WHERE invoice_id = p_invoice_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_payload->'items', '[]'::jsonb))
  LOOP
    INSERT INTO public.invoice_items (
      invoice_id, product_id, product_name, product_code, unit,
      quantity, price, vat_rate, vat_amount, line_total, sort_order
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
      v_sort
    );
    v_sort := v_sort + 1;
  END LOOP;

  RETURN (SELECT * FROM public.invoices WHERE id = p_invoice_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_invoice_with_items(uuid, uuid, jsonb) TO authenticated;
