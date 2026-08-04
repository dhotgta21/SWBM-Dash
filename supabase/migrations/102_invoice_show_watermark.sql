-- =============================================================================
-- 102_invoice_show_watermark.sql
--
-- Adds an optional company-logo watermark to the invoice PDF + on-screen
-- document. The watermark is rendered behind all other content, centred on the
-- page, at ~12% opacity, using the same logo source as the header.
--
-- Default is TRUE for new invoices (the user asked for it to be on by default)
-- and existing rows are backfilled to FALSE so already-issued documents keep
-- their current appearance — only freshly-created invoices opt in until an
-- operator toggles it on.
--
-- This migration also rebuilds `update_invoice_with_items` so the new column is
-- persisted on edits. Mirrors the DROP+CREATE pattern from 081 / 086 / 101
-- (the rebuild is required because the function's return type must match the
-- current `public.invoices` row).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. invoices — show_watermark column
-- ---------------------------------------------------------------------------
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS show_watermark boolean NOT NULL DEFAULT true;

-- Existing documents keep their current look — only new invoices default ON.
UPDATE public.invoices
  SET show_watermark = false
  WHERE show_watermark = true
    AND created_at < now();

COMMENT ON COLUMN public.invoices.show_watermark IS
  'Render the company logo as a centred, low-opacity background watermark. New invoices default ON; existing invoices were backfilled to OFF to preserve their current appearance.';

-- ---------------------------------------------------------------------------
-- 2. update_invoice_with_items — extend to accept and persist show_watermark
-- ---------------------------------------------------------------------------
-- DROP + CREATE so the function's effective return type is rebuilt against
-- the current invoices row. Mirrors 081 / 086 / 101.
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
  -- Lock the row to prevent concurrent edits.
  SELECT * INTO v_existing FROM public.invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice not found' USING ERRCODE = 'P0002';
  END IF;

  -- Authorization: caller must be the owner or an admin. SECURITY DEFINER
  -- preserves auth.uid() so is_admin() resolves against the session user,
  -- not the function owner. We deliberately check auth.uid() instead of
  -- trusting p_user_id, so even a misbehaving caller passing someone
  -- else's id is still gated correctly.
  SELECT public.is_admin() INTO v_is_admin;
  IF v_existing.created_by <> auth.uid() AND NOT v_is_admin THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  -- Update invoice metadata. NULLIF keeps empty strings from clobbering
  -- existing values when the field was omitted. Keys that are absent from
  -- the payload preserve the existing column value; keys that are present
  -- (even as empty strings) update it. This matches the caller's
  -- documented contract and prevents silently wiping
  -- order_number / account_number on every edit.
  --
  -- show_payment_terms / show_watermark follow the same absent-key
  -- preservation pattern as order_number: a previously-set value is not
  -- cleared when the form does not include the key. The form always sends
  -- both keys (as a boolean) so the practical behaviour is "write what
  -- the form sent".
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
    status                 = COALESCE(NULLIF(p_payload->>'status', ''), status),
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

  -- Replace line items atomically. DELETE + INSERT in the same transaction
  -- either both commit or both roll back, so items can never end up doubled
  -- or empty after a partial failure.
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

  -- Return the updated row. The CHECK(amount_paid <= total) constraint on the
  -- table is enforced here: if the new total is below amount_paid, the
  -- implicit statement aborts and the whole transaction rolls back.
  RETURN (SELECT * FROM public.invoices WHERE id = p_invoice_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_invoice_with_items(uuid, uuid, jsonb) TO authenticated;