-- =============================================================================
-- 145 — Fix convert_quote_request_to_invoice authorization
-- =============================================================================
-- The RPC previously authorized via auth.uid(), but the only caller
-- (lib/actions/admin-quote-requests.ts :: convertQuoteRequestToInvoice)
-- executes it through the service-role client where auth.uid() is always
-- NULL, and migrations 082/084 restricted EXECUTE to service_role only.
-- Result: every conversion failed with "Not authenticated".
--
-- Fix: authorize from p_user_id (the operator id passed by the server action,
-- which already authenticated the caller and checked the
-- quote_requests_convert permission app-side). This mirrors the sibling
-- convert_quote_to_invoice RPC, which trusts p_user_id / p_is_admin params.
-- =============================================================================

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
  -- Authorize via p_user_id. auth.uid() is NULL here because the calling
  -- server action executes through the service-role client; the action has
  -- already authenticated the operator and verified the
  -- quote_requests_convert permission before invoking this RPC.
  -- We re-verify against profiles: the operator must exist, be active, and
  -- be an admin or a staff member holding quote_requests_convert.
  SELECT (p.role = 'admin') INTO v_is_admin
    FROM public.profiles p
   WHERE p.id = p_user_id
     AND p.is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  IF NOT v_is_admin AND NOT EXISTS (
    SELECT 1
      FROM public.profiles p
     WHERE p.id = p_user_id
       AND p.role = 'staff'
       AND (p.permissions->>'quote_requests_convert')::boolean = true
  ) THEN
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

-- Keep execution restricted to the service role (the server action).
REVOKE EXECUTE ON FUNCTION public.convert_quote_request_to_invoice(
  uuid, uuid, text, date, text, text, text, text, text, text,
  numeric, numeric, numeric, jsonb, uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.convert_quote_request_to_invoice(
  uuid, uuid, text, date, text, text, text, text, text, text,
  numeric, numeric, numeric, jsonb, uuid
) TO service_role;
