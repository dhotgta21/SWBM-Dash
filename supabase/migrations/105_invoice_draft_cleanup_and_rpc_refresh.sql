-- =============================================================================
-- 105_invoice_draft_cleanup_and_rpc_refresh.sql
--
-- 1. Recreates public.update_invoice_with_items so its return type matches the
--    current public.invoices row. Migration 104 added status_stamps_enabled and
--    status_stamps_mode but did not refresh the RPC, so some database states
--    still reference a stale composite type and fail with SQLSTATE 42601
--    ("subquery must return only one column") when saving invoice edits —
--    including the simple draft -> sent status change.
--
-- 2. Adds public.cleanup_stale_draft_invoices() and a daily pg_cron schedule
--    to hard-delete draft invoices that have not been modified in 7 days and
--    have no payments recorded. This is intentionally a cleanup function, not
--    a user deletion path, so it bypasses the deletion-password gate used by
--    soft_delete_invoice().
-- =============================================================================

-- ---------------------------------------------------------------------------
-- A. Refresh update_invoice_with_items against the current invoices row
-- ---------------------------------------------------------------------------
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
  -- existing values when the field was omitted. Keys that are absent from the
  -- payload preserve the existing column value; keys that are present (even as
  -- empty strings) update it.
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

-- ---------------------------------------------------------------------------
-- B. Index for the draft cleanup query
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_invoices_draft_stale_cleanup
  ON public.invoices(updated_at)
  WHERE deleted_at IS NULL
    AND status = 'draft'
    AND amount_paid = 0;

COMMENT ON INDEX public.idx_invoices_draft_stale_cleanup IS
  'Supports the daily cleanup of abandoned draft invoices older than 7 days.';

-- ---------------------------------------------------------------------------
-- C. Cleanup function for stale draft invoices
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cleanup_stale_draft_invoices()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted integer;
BEGIN
  -- Hard-delete draft invoices that have not been modified in 7 days and have
  -- no payments. invoice_items are removed automatically via ON DELETE CASCADE.
  -- This is a background cleanup, not a user-initiated deletion, so it does
  -- not require the deletion password used by soft_delete_invoice().
  DELETE FROM public.invoices
  WHERE status = 'draft'
    AND deleted_at IS NULL
    AND amount_paid = 0
    AND updated_at < now() - interval '7 days';

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

COMMENT ON FUNCTION public.cleanup_stale_draft_invoices()
  IS 'Deletes draft invoices that have not been updated in 7 days and have no recorded payments.';

GRANT EXECUTE ON FUNCTION public.cleanup_stale_draft_invoices() TO service_role;

-- ---------------------------------------------------------------------------
-- D. Schedule daily cleanup via pg_cron when available
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'
  ) THEN
    -- Remove any previous schedule with the same name so this migration is
    -- idempotent.
    PERFORM cron.unschedule('cleanup-stale-draft-invoices');
    PERFORM cron.schedule(
      'cleanup-stale-draft-invoices',
      '0 3 * * *',  -- 03:00 UTC daily
      $cron$ SELECT public.cleanup_stale_draft_invoices(); $cron$
    );
  END IF;
END $$;
