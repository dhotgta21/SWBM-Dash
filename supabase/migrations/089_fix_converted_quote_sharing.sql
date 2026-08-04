-- Migration 086: Converted quotes must not be public by default.
--
-- convert_quote_to_invoice() was creating the new invoice as 'draft' while
-- hard-coding public_share_enabled = true. With the new secure default this
-- creates a publicly shareable draft, so we fix the RPC to keep the converted
-- invoice private until an operator explicitly enables sharing.

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
  -- Lock the source quote row.
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

  -- Use the client's current account number, not the quote's old snapshot.
  SELECT account_number INTO v_client_account
    FROM public.clients
   WHERE id = v_quote.client_id;

  v_your_reference := COALESCE(v_quote.your_reference, v_quote.order_number);

  -- Allocate a sequential document number for the new invoice.
  v_doc_number := public.generate_document_number(
    (SELECT invoice_prefix FROM public.company_settings WHERE id = 1)
  );

  -- Insert the new invoice. UNIQUE INDEX on converted_from_id means a
  -- concurrent second call fails here with 23505; we translate it.
  -- Sharing is disabled by default; the operator must explicitly turn it on.
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
      gen_random_uuid(), false, null
    )
    RETURNING id INTO v_invoice_id;
  EXCEPTION
    WHEN unique_violation THEN
      RAISE EXCEPTION 'This quotation has already been converted to an invoice.'
        USING ERRCODE = 'P0001';
  END;

  -- Copy line items.
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

  -- Mark the source quote as converted.
  UPDATE public.invoices SET status = 'converted' WHERE id = p_quote_id;

  RETURN v_invoice_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.convert_quote_to_invoice(uuid, uuid, boolean) TO service_role;
