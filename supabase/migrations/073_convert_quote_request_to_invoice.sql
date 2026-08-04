-- Atomic quote-request to invoice conversion.
--
-- The previous application logic created the invoice, inserted line items, and
-- updated the quote request as three separate client calls. A failure between
-- those calls could leave a dangling invoice or allow the request to be
-- converted twice.
--
-- This RPC wraps the invoice creation, line-item insertion, and quote-request
-- update in a single transaction. The caller is still responsible for resolving
-- or creating the client and allocating a document number; this function only
-- atomically commits the conversion itself. It independently enforces auth and
-- validates the chosen client so direct API calls cannot bypass the action
-- layer's permission checks.

CREATE OR REPLACE FUNCTION public.convert_quote_request_to_invoice(
  p_request_id uuid,
  p_client_id uuid,
  p_document_number text,
  p_issue_date date,
  p_notes text,
  p_delivery_address_line_1 text,
  p_delivery_address_line_2 text,
  p_delivery_town text,
  p_delivery_county text,
  p_delivery_postcode text,
  p_subtotal numeric,
  p_vat_total numeric,
  p_total numeric,
  p_items jsonb,
  p_user_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request_status text;
  v_invoice_id uuid;
  v_item jsonb;
  v_sort_order int := 0;
  v_is_admin boolean;
  v_client_created_by uuid;
BEGIN
  -- Enforce authentication and permission. Only admins or staff with the
  -- quote_requests_convert permission may convert requests.
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT public.is_admin() INTO v_is_admin;

  IF auth.uid() <> p_user_id AND NOT v_is_admin THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF NOT v_is_admin AND NOT public.has_staff_permission('quote_requests_convert') THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  -- Validate the chosen client: it must exist and the caller must own it or
  -- be an admin. This prevents attaching a converted quote to another operator's
  -- client record.
  SELECT created_by INTO v_client_created_by
    FROM public.clients
   WHERE id = p_client_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Client not found.' USING ERRCODE = 'P0002';
  END IF;

  IF v_client_created_by <> p_user_id AND NOT v_is_admin THEN
    RAISE EXCEPTION 'Not authorized to use this client.' USING ERRCODE = '42501';
  END IF;

  -- Lock the request and validate it can still be converted.
  SELECT status INTO v_request_status
    FROM public.quote_requests
   WHERE id = p_request_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quote request not found.' USING ERRCODE = 'P0002';
  END IF;

  IF v_request_status = 'invoiced' THEN
    RAISE EXCEPTION 'This quote request has already been converted to an invoice.' USING ERRCODE = 'P0001';
  END IF;

  IF v_request_status IN ('rejected', 'cancelled') THEN
    RAISE EXCEPTION 'Request is % and cannot be converted.', v_request_status USING ERRCODE = 'P0001';
  END IF;

  -- Insert the quotation invoice.
  INSERT INTO public.invoices (
    type,
    document_number,
    client_id,
    status,
    issue_date,
    notes,
    operator_name,
    delivery_address_line_1,
    delivery_address_line_2,
    delivery_town,
    delivery_county,
    delivery_postcode,
    subtotal,
    vat_total,
    total,
    amount_paid,
    created_by,
    share_token,
    public_share_enabled,
    share_token_expires_at
  ) VALUES (
    'quotation',
    p_document_number,
    p_client_id,
    'draft',
    p_issue_date,
    NULLIF(p_notes, ''),
    'Star Hawk Trade Counter',
    NULLIF(p_delivery_address_line_1, ''),
    NULLIF(p_delivery_address_line_2, ''),
    NULLIF(p_delivery_town, ''),
    NULLIF(p_delivery_county, ''),
    NULLIF(UPPER(p_delivery_postcode), ''),
    p_subtotal,
    p_vat_total,
    p_total,
    0,
    p_user_id,
    gen_random_uuid(),
    true,
    now() + interval '7 days'
  )
  RETURNING id INTO v_invoice_id;

  -- Insert line items.
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    INSERT INTO public.invoice_items (
      invoice_id,
      product_id,
      product_code,
      product_name,
      unit,
      quantity,
      price,
      line_total,
      vat_amount,
      vat_rate,
      sort_order
    ) VALUES (
      v_invoice_id,
      NULLIF(v_item->>'product_id', '')::uuid,
      NULLIF(v_item->>'product_code', ''),
      v_item->>'product_name',
      COALESCE(NULLIF(v_item->>'unit', ''), 'EA'),
      COALESCE((v_item->>'quantity')::numeric, 0),
      COALESCE((v_item->>'price')::numeric, 0),
      COALESCE((v_item->>'line_total')::numeric, 0),
      COALESCE((v_item->>'vat_amount')::numeric, 0),
      COALESCE((v_item->>'vat_rate')::numeric, 0),
      v_sort_order
    );
    v_sort_order := v_sort_order + 1;
  END LOOP;

  -- Link the request to the new invoice and mark it invoiced.
  UPDATE public.quote_requests
     SET status = 'invoiced',
         processed_by = p_user_id,
         processed_at = now(),
         created_invoice_id = v_invoice_id
   WHERE id = p_request_id;

  RETURN v_invoice_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.convert_quote_request_to_invoice(
  uuid, uuid, text, date, text, text, text, text, text, text,
  numeric, numeric, numeric, jsonb, uuid
) TO authenticated;

COMMENT ON FUNCTION public.convert_quote_request_to_invoice(
  uuid, uuid, text, date, text, text, text, text, text, text,
  numeric, numeric, numeric, jsonb, uuid
)
  IS 'Atomically converts an approved quote request into a quotation invoice (admin or quote_requests_convert permission).';
