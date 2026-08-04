-- =============================================================================
-- 103_invoice_status_stamps.sql
--
-- Adds three "stamp" toggles + the tracking fields that drive a realistic
-- PAID / PARTIALLY PAID / OVERDUE rubber-stamp overlay on the invoice PDF
-- and on-screen document. Each stamp type has its own boolean column so the
-- operator can opt out of any single one. The application layer auto-flips
-- the relevant toggle when the status changes, but every column is also
-- manually editable from the actions panel.
--
-- Tracking fields:
--   * paid_by  — full name of the operator who marked the document paid
--                (or NULL if it was never paid, or auto-marked by the
--                payment-recorder trigger).
--   * paid_at  — timestamptz of when the status flipped to 'paid'.
--   * overdue_at — timestamptz of when the status flipped to 'overdue'
--                (mirrors paid_at for the OVERDUE stamp).
--
-- All defaults are TRUE so newly-paid / partially-paid / overdue invoices
-- stamp automatically; operators can turn any of them off from the actions
-- card. We do NOT backfill existing rows — they keep whatever was on the
-- invoice at the time the migration runs (FALSE).
--
-- The RPC update_invoice_with_items is rebuilt to round-trip the three
-- toggle keys via the absent-key preservation pattern, mirroring the
-- existing show_payment_terms / show_watermark handling.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. invoices — stamp toggle columns + tracking timestamps
-- ---------------------------------------------------------------------------
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS show_paid_watermark          boolean     NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_partially_paid_watermark boolean     NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_overdue_watermark       boolean     NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS paid_by                      text,
  ADD COLUMN IF NOT EXISTS paid_at                      timestamptz,
  ADD COLUMN IF NOT EXISTS overdue_at                   timestamptz;

COMMENT ON COLUMN public.invoices.show_paid_watermark IS
  'When TRUE (and the invoice status is "paid"), render the green PAID rubber stamp on every page of the invoice PDF / on-screen document. The application flips this on by default when status flips to paid; operators can opt out.';
COMMENT ON COLUMN public.invoices.show_partially_paid_watermark IS
  'When TRUE (and the invoice status is "partial"), render the orange PARTIALLY PAID rubber stamp on every page.';
COMMENT ON COLUMN public.invoices.show_overdue_watermark IS
  'When TRUE (and the invoice status is "overdue"), render the red OVERDUE rubber stamp on every page.';
COMMENT ON COLUMN public.invoices.paid_by IS
  'Operator full name recorded at the moment the document was marked paid. Surfaces inside the PAID stamp and the operator/date line under it.';
COMMENT ON COLUMN public.invoices.paid_at IS
  'Timestamptz recorded at the moment the document was marked paid. Surfaces inside the PAID stamp.';
COMMENT ON COLUMN public.invoices.overdue_at IS
  'Timestamptz recorded at the moment the document was marked overdue. Surfaces inside the OVERDUE stamp.';

-- ---------------------------------------------------------------------------
-- 2. update_invoice_with_items — extend to persist the three toggle keys
-- ---------------------------------------------------------------------------
-- DROP + CREATE so the function's effective return type is rebuilt against
-- the current invoices row. Mirrors the pattern from 081 / 086 / 101 / 102.
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
  -- not the function owner.
  SELECT public.is_admin() INTO v_is_admin;
  IF v_existing.created_by <> auth.uid() AND NOT v_is_admin THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  -- Update invoice metadata. NULLIF keeps empty strings from clobbering
  -- existing values when the field was omitted. Keys that are absent from
  -- the payload preserve the existing column value; keys that are present
  -- (even as empty strings) update it.
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