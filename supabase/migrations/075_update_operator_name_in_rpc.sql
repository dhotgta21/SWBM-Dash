-- REDEFINE convert_quote_to_invoice to look up operator's full name from profiles
CREATE OR REPLACE FUNCTION public.convert_quote_to_invoice(
  p_quote_id uuid,
  p_user_id uuid,
  p_is_admin boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_quote public.invoices;
  v_doc_number text;
  v_invoice_id uuid;
  v_today date := current_date;
  v_due_date date := current_date + INTERVAL '30 days';
  v_client_account text;
  v_your_reference text;
  v_item RECORD;
  v_idx int := 0;
  v_operator_name text;
BEGIN
  SELECT * INTO v_quote FROM public.invoices WHERE id = p_quote_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quote not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_quote.type <> 'quotation' THEN
    RAISE EXCEPTION 'Source document is not a quotation.' USING ERRCODE = 'P0001';
  END IF;
  IF v_quote.status NOT IN ('draft', 'sent') THEN
    RAISE EXCEPTION 'Only draft or sent quotes can be converted.' USING ERRCODE = 'P0001';
  END IF;
  IF v_quote.created_by <> p_user_id AND NOT p_is_admin THEN
    RAISE EXCEPTION 'Not authorised' USING ERRCODE = '42501';
  END IF;

  -- Look up the operator's display name from the profile of the user performing the conversion
  SELECT COALESCE(full_name, NULLIF(TRIM(CONCAT_WS(' ', first_name, last_name)), ''), 'Unknown Operator')
    INTO v_operator_name
    FROM public.profiles
   WHERE id = p_user_id;

  SELECT account_number INTO v_client_account
    FROM public.clients
   WHERE id = v_quote.client_id;

  v_your_reference := COALESCE(v_quote.your_reference, v_quote.order_number);

  v_doc_number := public.generate_document_number(
    (SELECT invoice_prefix FROM public.company_settings WHERE id = 1)
  );

  BEGIN
    INSERT INTO public.invoices (
      type, document_number, client_id, issue_date, due_date,
      order_number, account_number, operator_name, your_reference, notes,
      delivery_method,
      delivery_address_line_1, delivery_address_line_2,
      delivery_town, delivery_county, delivery_postcode,
      subtotal, vat_total, total,
      converted_from_id, status, created_by,
      share_token, public_share_enabled, share_token_expires_at
    ) VALUES (
      'invoice', v_doc_number, v_quote.client_id, v_today, v_due_date,
      v_quote.order_number, v_client_account, v_operator_name, v_your_reference, v_quote.notes,
      COALESCE(v_quote.delivery_method, 'delivery'),
      v_quote.delivery_address_line_1, v_quote.delivery_address_line_2,
      v_quote.delivery_town, v_quote.delivery_county, v_quote.delivery_postcode,
      v_quote.subtotal, v_quote.vat_total, v_quote.total,
      p_quote_id, 'draft', p_user_id,
      gen_random_uuid(), true, now() + interval '7 days'
    )
    RETURNING id INTO v_invoice_id;
  EXCEPTION
    WHEN unique_violation THEN
      RAISE EXCEPTION 'This quotation has already been converted to an invoice.'
        USING ERRCODE = 'P0001';
  END;

  FOR v_item IN
    SELECT product_id, product_name, product_code, unit,
           quantity, price, vat_rate, vat_amount, line_total
      FROM public.invoice_items
     WHERE invoice_id = p_quote_id
     ORDER BY sort_order ASC
  LOOP
    v_idx := v_idx + 1;
    INSERT INTO public.invoice_items (
      invoice_id, product_id, product_name, product_code, unit,
      quantity, price, vat_rate, vat_amount, line_total, sort_order
    ) VALUES (
      v_invoice_id, v_item.product_id, v_item.product_name, v_item.product_code, v_item.unit,
      v_item.quantity, v_item.price, v_item.vat_rate, v_item.vat_amount, v_item.line_total, v_idx
    );
  END LOOP;

  UPDATE public.invoices SET status = 'converted' WHERE id = p_quote_id;

  RETURN v_invoice_id;
END;
$$;


-- REDEFINE convert_quote_request_to_invoice to look up operator's full name from profiles
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
  v_operator_name text;
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

  -- Look up the operator name from the profile of the user performing the conversion
  SELECT COALESCE(full_name, NULLIF(TRIM(CONCAT_WS(' ', first_name, last_name)), ''), 'Unknown Operator')
    INTO v_operator_name
    FROM public.profiles
   WHERE id = p_user_id;

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
    v_operator_name,
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
