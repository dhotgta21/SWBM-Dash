-- ============================================================================
-- Migration 122 — Wallet hardening, payment RLS alignment, and invoice
-- delete/restore reconciliation.
--
-- Closes the production-readiness gaps found after migrations 106/107/117:
--   1. recompute_invoice_paid now ignores soft-deleted payments (so a reversed
--      wallet payment can be re-applied to the same invoice without tripping
--      the amount_paid<=total CHECK or overstating amount_paid).
--   2. apply_client_account_balance gains p_verified_name and persists the
--      operator signature on both the payment row and the immutable ledger row
--      (previously the "Verified by" line was blank for every allocation).
--   3. deposit/apply RPCs normalise the signature SQL-side (defence in depth).
--   4. payments_insert RLS is tightened to match the createPayment server gate
--      (invoices_record_payment + created_by = auth.uid()).
--   5. soft_delete_invoice / restore_invoice now reconcile the client wallet
--      (restore balance + reversal ledger on delete; re-debit + allocation on
--      restore) instead of stranding / double-granting credit.
--   6. client_account_audit_log INSERT policy is locked to WITH CHECK (false) so
--      rows can only be written via the SECURITY DEFINER RPC.
--
-- Idempotent: safe to re-run (IF EXISTS / CREATE OR REPLACE / DROP … IF EXISTS).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. recompute_invoice_paid — exclude soft-deleted payments from the SUM.
--    The function body is otherwise identical to migration 115 (stock-routing
--    aware status/picking logic preserved verbatim).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.recompute_invoice_paid()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice_id uuid := COALESCE(NEW.invoice_id, OLD.invoice_id);
  v_paid numeric;
  v_total numeric;
  v_current_status text;
  v_new_status text;
  v_picking_status text;
BEGIN
  IF v_invoice_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(SUM(amount), 0)
    INTO v_paid
    FROM public.payments
   WHERE invoice_id = v_invoice_id
     AND deleted_at IS NULL;

  SELECT total, status, picking_status
    INTO v_total, v_current_status, v_picking_status
    FROM public.invoices
   WHERE id = v_invoice_id;

  v_new_status := CASE
    WHEN v_total IS NULL THEN v_current_status
    WHEN v_total > 0 AND v_paid >= v_total THEN 'paid'
    WHEN v_paid > 0 THEN 'partial'
    WHEN v_current_status = 'draft' THEN 'draft'
    ELSE 'sent'
  END;

  UPDATE public.invoices
     SET amount_paid = v_paid,
         status = v_new_status,
         picking_status = CASE
           WHEN v_new_status = 'paid'
                AND v_picking_status IN ('loaded', 'completed')
                AND picking_status <> 'delivered'
             THEN 'delivered'
           ELSE picking_status
         END,
         picking_delivered_at = CASE
           WHEN v_new_status = 'paid'
                AND v_picking_status IN ('loaded', 'completed')
                AND picking_status <> 'delivered'
             THEN now()
           ELSE picking_delivered_at
         END,
         updated_at = now()
   WHERE id = v_invoice_id;

  RETURN NULL;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. apply_client_account_balance — add p_verified_name and persist it.
--    Signature changes, so the old 4-param overload is dropped first (117
--    granted the old signature; we re-grant the new one below).
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.apply_client_account_balance(uuid, uuid[], numeric[], text);
DROP FUNCTION IF EXISTS public.apply_client_account_balance(uuid, uuid[], numeric[], text, text);

CREATE OR REPLACE FUNCTION public.apply_client_account_balance(
  p_client_id uuid,
  p_invoice_ids uuid[],
  p_amounts numeric[],
  p_notes text DEFAULT NULL,
  p_verified_name text DEFAULT NULL
) RETURNS uuid[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_transaction_ids uuid[] := '{}';
  v_total_to_apply numeric := 0;
  v_current_balance numeric;
  v_invoice_id uuid;
  v_amount numeric;
  v_invoice_total numeric;
  v_invoice_paid numeric;
  v_payment_id uuid;
  v_transaction_id uuid;
  v_verified_name text;
  i int;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  IF NOT (
    public.is_admin()
    OR (public.has_staff_permission('clients_manage_account') AND public.has_staff_permission('clients_see_money'))
  ) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF array_length(p_invoice_ids, 1) IS NULL
     OR array_length(p_invoice_ids, 1) <> coalesce(array_length(p_amounts, 1), 0) THEN
    RAISE EXCEPTION 'Invoice and amount arrays must match' USING ERRCODE = '22023';
  END IF;

  FOREACH v_amount IN ARRAY p_amounts LOOP
    IF v_amount IS NULL OR v_amount <= 0 THEN
      RAISE EXCEPTION 'Each amount must be greater than zero' USING ERRCODE = '22023';
    END IF;
    v_total_to_apply := v_total_to_apply + v_amount;
  END LOOP;

  IF v_total_to_apply <= 0 THEN
    RAISE EXCEPTION 'Nothing to apply' USING ERRCODE = '22023';
  END IF;

  -- Normalise the operator signature SQL-side too: whitespace runs -> a single
  -- underscore, case preserved. The app already does this; this is defence in
  -- depth for any direct (permission-gated) RPC caller.
  v_verified_name := NULLIF(regexp_replace(trim(coalesce(p_verified_name, '')), '\s+', '_', 'g'), '');

  SELECT account_balance INTO v_current_balance
    FROM public.clients
   WHERE id = p_client_id
   FOR UPDATE;

  IF v_current_balance IS NULL THEN
    RAISE EXCEPTION 'Client not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_total_to_apply > v_current_balance THEN
    RAISE EXCEPTION 'Insufficient account balance. Available: %, requested: %',
      v_current_balance, v_total_to_apply
      USING ERRCODE = '23514';
  END IF;

  FOR i IN 1..array_length(p_invoice_ids, 1) LOOP
    v_invoice_id := p_invoice_ids[i];
    v_amount := p_amounts[i];

    SELECT total, amount_paid INTO v_invoice_total, v_invoice_paid
      FROM public.invoices
     WHERE id = v_invoice_id
       AND client_id = p_client_id
       AND type = 'invoice'
       AND deleted_at IS NULL
       AND status IN ('sent', 'partial', 'overdue', 'due')
     FOR UPDATE;

    IF v_invoice_total IS NULL THEN
      RAISE EXCEPTION 'Invoice % not found', v_invoice_id USING ERRCODE = 'P0002';
    END IF;

    IF v_invoice_total - v_invoice_paid < v_amount THEN
      RAISE EXCEPTION 'Amount % exceeds remaining balance on invoice %',
        v_amount, v_invoice_id
        USING ERRCODE = '23514';
    END IF;

    INSERT INTO public.payments (
      invoice_id, amount, payment_date, method, reference, notes, source, verified_name, created_by
    ) VALUES (
      v_invoice_id, v_amount, CURRENT_DATE, 'other', NULL,
      NULLIF(trim(p_notes), ''), 'client_account', v_verified_name, v_user_id
    )
    RETURNING id INTO v_payment_id;

    v_current_balance := v_current_balance - v_amount;

    UPDATE public.clients
       SET account_balance = v_current_balance,
           updated_at = now()
     WHERE id = p_client_id;

    INSERT INTO public.client_account_transactions (
      client_id, type, amount, running_balance, invoice_id, payment_id, method, notes,
      verified_name, verified_by, verified_at, created_by
    ) VALUES (
      p_client_id, 'allocation', v_amount, v_current_balance, v_invoice_id,
      v_payment_id, 'other', NULLIF(trim(p_notes), ''),
      v_verified_name, v_user_id, now(), v_user_id
    )
    RETURNING id INTO v_transaction_id;

    v_transaction_ids := array_append(v_transaction_ids, v_transaction_id);
  END LOOP;

  RETURN v_transaction_ids;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.apply_client_account_balance(uuid, uuid[], numeric[], text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_client_account_balance(uuid, uuid[], numeric[], text, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. deposit_to_client_account — SQL-side signature normalisation (defence in
--    depth). Signature unchanged, so CREATE OR REPLACE is safe.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.deposit_to_client_account(
  p_client_id uuid,
  p_amount numeric,
  p_method text,
  p_reference text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_verified_name text DEFAULT NULL,
  p_transaction_date date DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_transaction_id uuid;
  v_new_balance numeric;
  v_verified_name text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  IF NOT (
    public.is_admin()
    OR (public.has_staff_permission('clients_manage_account') AND public.has_staff_permission('clients_see_money'))
  ) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be greater than zero' USING ERRCODE = '22023';
  END IF;

  IF p_method IS NULL OR p_method NOT IN ('cash', 'bank_transfer', 'card', 'cheque', 'other', 'ecod') THEN
    RAISE EXCEPTION 'Invalid payment method' USING ERRCODE = '22023';
  END IF;

  v_verified_name := NULLIF(regexp_replace(trim(coalesce(p_verified_name, '')), '\s+', '_', 'g'), '');

  UPDATE public.clients
     SET account_balance = account_balance + p_amount,
         updated_at = now()
   WHERE id = p_client_id
   RETURNING account_balance INTO v_new_balance;

  IF v_new_balance IS NULL THEN
    RAISE EXCEPTION 'Client not found' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.client_account_transactions (
    client_id, type, amount, transaction_date, running_balance, method, reference, notes,
    verified_name, verified_by, verified_at, created_by
  ) VALUES (
    p_client_id, 'deposit', p_amount,
    COALESCE(p_transaction_date, CURRENT_DATE),
    v_new_balance, p_method,
    NULLIF(trim(p_reference), ''), NULLIF(trim(p_notes), ''),
    v_verified_name, v_user_id, now(), v_user_id
  )
  RETURNING id INTO v_transaction_id;

  RETURN v_transaction_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.deposit_to_client_account(uuid, numeric, text, text, text, text, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.deposit_to_client_account(uuid, numeric, text, text, text, text, date) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. payments_insert RLS — match the createPayment server gate. Wallet
--    allocations insert via the SECURITY DEFINER apply RPC (bypasses RLS), so
--    this only narrows direct PostgREST inserts to the same rule the app uses.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS payments_insert ON public.payments;
CREATE POLICY payments_insert ON public.payments
  FOR INSERT TO authenticated WITH CHECK (
    public.is_admin() OR (
      EXISTS (
        SELECT 1 FROM public.profiles p
         WHERE p.id = auth.uid() AND p.role <> 'client'
      )
      AND public.has_staff_permission('invoices_record_payment')
      AND created_by = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 5. soft_delete_invoice / restore_invoice — reconcile the client wallet.
--    Bodies reproduced from migration 093 with a wallet-reconciliation loop
--    added at the payment state change.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.soft_delete_invoice(
  p_invoice_id uuid,
  p_password text,
  p_ip_address text DEFAULT NULL,
  p_user_agent text DEFAULT NULL
)
RETURNS public.deletion_result
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_attempt_count integer;
  v_success_count integer;
  v_global_count integer;
  v_invoice public.invoices%ROWTYPE;
  v_rec RECORD;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN (false, 'unauthenticated', 'You must be signed in.')::public.deletion_result;
  END IF;

  IF p_ip_address IS NOT NULL THEN
    v_attempt_count := public.check_rate_limit('delete-attempt:' || p_ip_address, 10, 600);
    IF v_attempt_count > 10 THEN
      PERFORM public.log_deletion_event(
        'rate_limited', 'invoices', p_invoice_id, p_ip_address, p_user_agent, false,
        jsonb_build_object('reason', 'too_many_attempts')
      );
      RETURN (false, 'rate_limited', 'Too many deletion attempts. Please try again later.')::public.deletion_result;
    END IF;
  END IF;

  IF NOT public.verify_deletion_password(p_password) THEN
    PERFORM public.log_deletion_event(
      'failed_attempt', 'invoices', p_invoice_id, p_ip_address, p_user_agent, false,
      jsonb_build_object('reason', 'wrong_password')
    );
    RETURN (false, 'wrong_password', 'Deletion password is incorrect.')::public.deletion_result;
  END IF;

  v_success_count := public.check_rate_limit('delete-success:' || v_user_id::text, 3, 600);
  IF v_success_count > 3 THEN
    PERFORM public.log_deletion_event(
      'rate_limited', 'invoices', p_invoice_id, p_ip_address, p_user_agent, false,
      jsonb_build_object('reason', 'per_user_limit')
    );
    RETURN (false, 'rate_limited', 'Deletion limit reached. Please try again later.')::public.deletion_result;
  END IF;

  v_global_count := public.check_rate_limit('delete-success:global', 10, 600);
  IF v_global_count > 10 THEN
    PERFORM public.log_deletion_event(
      'rate_limited', 'invoices', p_invoice_id, p_ip_address, p_user_agent, false,
      jsonb_build_object('reason', 'global_limit')
    );
    RETURN (false, 'rate_limited', 'Global deletion limit reached. Please try again later.')::public.deletion_result;
  END IF;

  SELECT * INTO v_invoice FROM public.invoices
   WHERE id = p_invoice_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RETURN (false, 'not_found', 'Invoice not found.')::public.deletion_result;
  END IF;

  IF NOT public.user_can_delete_invoice(v_user_id, p_invoice_id) THEN
    RETURN (false, 'unauthorized', 'You are not allowed to delete this invoice.')::public.deletion_result;
  END IF;

  -- Paid/partial/converted (or any payment applied) still require admin.
  IF (
    v_invoice.status IN ('paid', 'partial', 'converted')
    OR COALESCE(v_invoice.amount_paid, 0) > 0
  ) AND NOT public.is_admin() THEN
    RETURN (false, 'protected_status', 'Only admins can delete paid, partial, or converted documents.')::public.deletion_result;
  END IF;

  -- Reconcile the client wallet: any client-account payment on this invoice is
  -- being removed, so restore the credit and write an immutable reversal row.
  -- Filter deleted_at IS NULL so a re-run never double-restores.
  FOR v_rec IN
    SELECT p.id AS payment_id, p.amount AS amount, i.client_id AS client_id
      FROM public.payments p
      JOIN public.invoices i ON i.id = p.invoice_id
     WHERE p.invoice_id = p_invoice_id
       AND p.source = 'client_account'
       AND p.deleted_at IS NULL
  LOOP
    UPDATE public.clients
       SET account_balance = account_balance + v_rec.amount,
           updated_at = now()
     WHERE id = v_rec.client_id;

    INSERT INTO public.client_account_transactions (
      client_id, type, amount, transaction_date, running_balance,
      invoice_id, payment_id, method, notes, verified_by, verified_at, created_by
    )
    SELECT v_rec.client_id, 'reversal', v_rec.amount, CURRENT_DATE,
           c.account_balance, p_invoice_id, v_rec.payment_id, 'other',
           'Reversed: invoice deleted',
           v_user_id, now(), v_user_id
      FROM public.clients c WHERE c.id = v_rec.client_id;
    -- The immutable ledger row above is the money audit trail; the deletion
    -- itself is recorded by log_deletion_event below. (We deliberately do not
    -- call log_client_account_action here: it is gated to admin/manage-account
    -- and must never be able to abort the reconciliation.)
  END LOOP;

  UPDATE public.invoices     SET deleted_at = now() WHERE id = p_invoice_id;
  UPDATE public.invoice_items SET deleted_at = now() WHERE invoice_id = p_invoice_id;
  UPDATE public.payments     SET deleted_at = now() WHERE invoice_id = p_invoice_id;

  PERFORM public.log_deletion_event(
    'soft_delete', 'invoices', p_invoice_id, p_ip_address, p_user_agent, true, NULL
  );

  RETURN (true, NULL, 'Invoice deleted.')::public.deletion_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.restore_invoice(
  p_invoice_id uuid,
  p_password text,
  p_ip_address text DEFAULT NULL,
  p_user_agent text DEFAULT NULL
)
RETURNS public.deletion_result
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_rec RECORD;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN (false, 'unauthenticated', 'You must be signed in.')::public.deletion_result;
  END IF;

  IF NOT public.verify_deletion_password(p_password) THEN
    RETURN (false, 'wrong_password', 'Deletion password is incorrect.')::public.deletion_result;
  END IF;

  IF NOT public.user_can_delete_invoice(v_user_id, p_invoice_id) THEN
    RETURN (false, 'unauthorized', 'You are not allowed to restore this invoice.')::public.deletion_result;
  END IF;

  -- Reconcile the client wallet: re-apply any client-account payment that is
  -- being restored. Filter deleted_at IS NOT NULL so a re-run never double-
  -- debits. running_balance reflects the post-deduction balance.
  FOR v_rec IN
    SELECT p.id AS payment_id, p.amount AS amount, i.client_id AS client_id
      FROM public.payments p
      JOIN public.invoices i ON i.id = p.invoice_id
     WHERE p.invoice_id = p_invoice_id
       AND p.source = 'client_account'
       AND p.deleted_at IS NOT NULL
  LOOP
    UPDATE public.clients
       SET account_balance = account_balance - v_rec.amount,
           updated_at = now()
     WHERE id = v_rec.client_id;

    INSERT INTO public.client_account_transactions (
      client_id, type, amount, transaction_date, running_balance,
      invoice_id, payment_id, method, notes, verified_by, verified_at, created_by
    )
    SELECT v_rec.client_id, 'allocation', v_rec.amount, CURRENT_DATE,
           c.account_balance, p_invoice_id, v_rec.payment_id, 'other',
           'Restored: invoice undeleted',
           v_user_id, now(), v_user_id
      FROM public.clients c WHERE c.id = v_rec.client_id;
    -- Ledger row above is the money audit trail; log_deletion_event below
    -- records the restore. No log_client_account_action here (see delete path).
  END LOOP;

  UPDATE public.invoices     SET deleted_at = NULL WHERE id = p_invoice_id;
  UPDATE public.invoice_items SET deleted_at = NULL WHERE invoice_id = p_invoice_id;
  UPDATE public.payments     SET deleted_at = NULL WHERE invoice_id = p_invoice_id;

  PERFORM public.log_deletion_event(
    'restore', 'invoices', p_invoice_id, p_ip_address, p_user_agent, true, NULL
  );

  RETURN (true, NULL, 'Invoice restored.')::public.deletion_result;
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. Lock the audit-log insert path to the SECURITY DEFINER RPC only.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS client_account_audit_log_insert ON public.client_account_audit_log;
CREATE POLICY client_account_audit_log_insert ON public.client_account_audit_log
  FOR INSERT TO authenticated WITH CHECK (false);
