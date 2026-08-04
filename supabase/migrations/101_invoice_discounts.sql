-- =============================================================================
-- 101_invoice_discounts.sql
--
-- Adds manual per-line and order-level discounts to invoices.
--
-- Discounts are entered as either:
--   * A £ amount (per-unit for per-line discount; total for order-level), OR
--   * A % percentage applied to the line net / order subtotal.
--
-- The form uses one column per line and one row in the totals card. The math
-- is computed client-side and re-verified server-side by `lib/vat.ts`. The DB
-- guards the last mile with CHECK constraints so bad data can never land.
--
-- Semantics (also documented in INVOICE_DISCOUNTS_PLAN.md §3):
--   * Per-line: % of the line net OR £ per-unit × quantity.
--   * Order-level: % of Σ(line nets) OR flat £ amount.
--   * Either kind is enforced as mutually exclusive on each row.
--   * VAT always tracks the net — order-level discount drops VAT by
--     20% × discount. Per-line VAT is shown per row.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. invoice_items — per-line discount columns
-- ---------------------------------------------------------------------------
ALTER TABLE public.invoice_items
  ADD COLUMN IF NOT EXISTS discount_amount  numeric(12,2),
  ADD COLUMN IF NOT EXISTS discount_percent numeric(5,2);

ALTER TABLE public.invoice_items
  DROP CONSTRAINT IF EXISTS invoice_items_discount_amount_nonneg;
ALTER TABLE public.invoice_items
  ADD CONSTRAINT invoice_items_discount_amount_nonneg
  CHECK (discount_amount IS NULL OR discount_amount >= 0);

ALTER TABLE public.invoice_items
  DROP CONSTRAINT IF EXISTS invoice_items_discount_percent_range;
ALTER TABLE public.invoice_items
  ADD CONSTRAINT invoice_items_discount_percent_range
  CHECK (discount_percent IS NULL OR (discount_percent > 0 AND discount_percent <= 100));

ALTER TABLE public.invoice_items
  DROP CONSTRAINT IF EXISTS invoice_items_discount_only_one;
ALTER TABLE public.invoice_items
  ADD CONSTRAINT invoice_items_discount_only_one
  CHECK (NOT (discount_amount IS NOT NULL AND discount_percent IS NOT NULL));

COMMENT ON COLUMN public.invoice_items.discount_amount  IS 'Per-line fixed discount in pounds, PER UNIT. Multiply by quantity to get the £ deduction from the line net.';
COMMENT ON COLUMN public.invoice_items.discount_percent IS 'Per-line percentage discount. Applied to qty × price (line net pre-discount).';

-- ---------------------------------------------------------------------------
-- 2. invoices — order-level discount columns
-- ---------------------------------------------------------------------------
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS discount_amount  numeric(12,2),
  ADD COLUMN IF NOT EXISTS discount_percent numeric(5,2);

ALTER TABLE public.invoices
  DROP CONSTRAINT IF EXISTS invoices_discount_amount_nonneg;
ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_discount_amount_nonneg
  CHECK (discount_amount IS NULL OR discount_amount >= 0);

ALTER TABLE public.invoices
  DROP CONSTRAINT IF EXISTS invoices_discount_percent_range;
ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_discount_percent_range
  CHECK (discount_percent IS NULL OR (discount_percent > 0 AND discount_percent <= 100));

ALTER TABLE public.invoices
  DROP CONSTRAINT IF EXISTS invoices_discount_only_one;
ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_discount_only_one
  CHECK (NOT (discount_amount IS NOT NULL AND discount_percent IS NOT NULL));

COMMENT ON COLUMN public.invoices.discount_amount  IS 'Order-level fixed discount in pounds, applied once to the post-line-discount subtotal.';
COMMENT ON COLUMN public.invoices.discount_percent IS 'Order-level percentage discount applied to the post-line-discount subtotal. VAT is computed on the discounted net.';

-- ---------------------------------------------------------------------------
-- 3. update_invoice_with_items — extend to accept and persist discount keys
-- ---------------------------------------------------------------------------
-- DROP + CREATE (rather than CREATE OR REPLACE) so the function's effective
-- return type is rebuilt against the current invoices row. Mirrors the
-- pattern used by 081_recreate_update_invoice_rpc_return_type to avoid the
-- "subquery must return only one column" class of stale-type bugs.
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
  -- discount_amount / discount_percent follow the same absent-key
  -- preservation pattern as order_number: an existing discount is not
  -- cleared when the form does not include the key in p_payload. The form
  -- always sends both keys (as NULL or a numeric), so the practical
  -- behaviour is "write what the form sent".
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
