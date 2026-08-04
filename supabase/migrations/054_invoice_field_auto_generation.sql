-- Migration 054: Invoice field auto-generation fixes.
-- 1. Clients get their own account number (separate from staff profiles).
-- 2. Invoices get a dedicated your_reference column.
-- 3. Existing clients are backfilled with unique account numbers.
-- 4. update_invoice_with_items is updated to write your_reference.
-- 5. convert_quote_to_invoice uses the client's current account number and
--    copies your_reference (falling back to order number).

-- Add columns.
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS account_number text;

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS your_reference text;

-- Partial unique index for client account numbers.
CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_account_number_unique
  ON public.clients(account_number)
  WHERE account_number IS NOT NULL;

-- Generator for unique 7-digit client account numbers.
CREATE OR REPLACE FUNCTION public.generate_unique_client_account_number()
RETURNS text
LANGUAGE plpgsql
VOLATILE
AS $$
DECLARE
  v_attempts integer := 0;
  v_candidate text;
  v_exists boolean;
BEGIN
  LOOP
    v_attempts := v_attempts + 1;
    -- 1000000..9999999, zero-padded to 7 digits.
    v_candidate := lpad((floor(random() * 9000000) + 1000000)::text, 7, '0');

    SELECT EXISTS (
      SELECT 1 FROM public.clients WHERE account_number = v_candidate
    ) INTO v_exists;

    EXIT WHEN NOT v_exists;

    IF v_attempts >= 50 THEN
      RAISE EXCEPTION 'Could not allocate a unique client account number after 50 attempts';
    END IF;
  END LOOP;

  RETURN v_candidate;
END;
$$;

-- Backfill existing clients that do not yet have an account number.
DO $$
DECLARE
  v_client RECORD;
BEGIN
  FOR v_client IN
    SELECT id FROM public.clients WHERE account_number IS NULL
  LOOP
    UPDATE public.clients
       SET account_number = public.generate_unique_client_account_number()
     WHERE id = v_client.id;
  END LOOP;
END;
$$;

-- Backfill existing invoices so their account_number matches the linked client
-- (previously it held the operator's account number, which was incorrect).
UPDATE public.invoices i
   SET account_number = c.account_number
  FROM public.clients c
 WHERE i.client_id = c.id
   AND (i.account_number IS DISTINCT FROM c.account_number);

-- Backfill your_reference for existing invoices so the column stays in sync
-- with what is rendered (fallback to order_number). New invoices get this set
-- automatically by lib/actions/invoices.ts.
UPDATE public.invoices
   SET your_reference = order_number
 WHERE your_reference IS NULL
   AND order_number IS NOT NULL;

COMMENT ON COLUMN public.clients.account_number IS 'Unique 7-digit customer account number, generated automatically when a client is created.';
COMMENT ON COLUMN public.invoices.your_reference IS 'Customer-facing reference for the document. Auto-populated with the order number when left blank.';

-- Update the atomic invoice update function to handle your_reference.
CREATE OR REPLACE FUNCTION public.update_invoice_with_items(
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
    issue_date             = COALESCE(NULLIF(p_payload->>'issue_date', '')::date, issue_date),
    issue_time             = CASE
                              WHEN p_payload ? 'issue_time' THEN NULLIF(p_payload->>'issue_time', '')::time
                              ELSE issue_time
                            END,
    due_date               = NULLIF(p_payload->>'due_date', '')::date,
    expiry_date            = NULLIF(p_payload->>'expiry_date', '')::date,
    order_number           = NULLIF(p_payload->>'order_number', ''),
    account_number         = NULLIF(p_payload->>'account_number', ''),
    operator_name          = COALESCE(NULLIF(p_payload->>'operator_name', ''), operator_name),
    your_reference         = NULLIF(p_payload->>'your_reference', ''),
    notes                  = NULLIF(p_payload->>'notes', ''),
    status                 = COALESCE(NULLIF(p_payload->>'status', ''), status),
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

-- Update quote → invoice conversion to use the client's current account number
-- and to carry your_reference across (falling back to order number).
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
      delivery_address_line_1, delivery_address_line_2,
      delivery_town, delivery_county, delivery_postcode,
      subtotal, vat_total, total,
      converted_from_id, status, created_by,
      share_token, public_share_enabled, share_token_expires_at
    ) VALUES (
      'invoice', v_doc_number, v_quote.client_id, v_today, v_due_date,
      v_quote.order_number, v_client_account, v_quote.operator_name, v_your_reference, v_quote.notes,
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
