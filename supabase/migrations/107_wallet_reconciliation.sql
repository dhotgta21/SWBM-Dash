-- =============================================================================
-- 107_wallet_reconciliation.sql
--
-- Hardens soft_delete_payment so that deleting a payment correctly:
--   1. Restores the client's account_balance for wallet (client_account) payments.
--   2. Records a reversal row in client_account_transactions.
--   3. Recomputes the parent invoice's amount_paid and status from the
--      remaining non-deleted payments.
--
-- This fixes a pre-existing bug where soft-deleting a payment left the invoice
-- marked as paid/partial and never restored wallet credit.
--
-- Also adds a dedicated audit log + RPC for client-account mutations so server
-- actions can record deposits, allocations, failed verifications and rate-limit
-- events without widening RLS.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- A. Extend the ledger type enum so reversals are distinct from allocations.
-- ---------------------------------------------------------------------------
ALTER TABLE public.client_account_transactions
  DROP CONSTRAINT IF EXISTS client_account_transactions_type_check;

ALTER TABLE public.client_account_transactions
  ADD CONSTRAINT client_account_transactions_type_check
  CHECK (type IN ('deposit', 'allocation', 'withdrawal', 'adjustment', 'reversal'));

-- ---------------------------------------------------------------------------
-- B. Audit log for client-account money actions.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.client_account_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action text NOT NULL CHECK (action IN ('deposit', 'apply_balance', 'reversal', 'failed_verification', 'rate_limited')),
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  invoice_ids uuid[],
  amount numeric(12,2),
  verified_name text,
  performed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ip_address text,
  user_agent text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_account_audit_log_client_created_at
  ON public.client_account_audit_log(client_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_client_account_audit_log_performed_by_created_at
  ON public.client_account_audit_log(performed_by, created_at DESC);

ALTER TABLE public.client_account_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS client_account_audit_log_select ON public.client_account_audit_log;
CREATE POLICY client_account_audit_log_select ON public.client_account_audit_log
  FOR SELECT TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS client_account_audit_log_insert ON public.client_account_audit_log;
CREATE POLICY client_account_audit_log_insert ON public.client_account_audit_log
  FOR INSERT TO authenticated WITH CHECK (performed_by = auth.uid());

-- Helper used by server actions to append audit rows. SECURITY DEFINER so the
-- caller does not need broad INSERT privileges.
CREATE OR REPLACE FUNCTION public.log_client_account_action(
  p_action text,
  p_client_id uuid DEFAULT NULL,
  p_invoice_ids uuid[] DEFAULT NULL,
  p_amount numeric DEFAULT NULL,
  p_verified_name text DEFAULT NULL,
  p_ip_address text DEFAULT NULL,
  p_user_agent text DEFAULT NULL,
  p_metadata jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.client_account_audit_log (
    action, client_id, invoice_ids, amount, verified_name, performed_by,
    ip_address, user_agent, metadata
  ) VALUES (
    p_action, p_client_id, p_invoice_ids, p_amount, p_verified_name, auth.uid(),
    p_ip_address, p_user_agent, p_metadata
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- C. Hardened soft_delete_payment with wallet reconciliation.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.soft_delete_payment(
  p_payment_id uuid,
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
  v_payment public.payments%ROWTYPE;
  v_invoice_id uuid;
  v_client_id uuid;
  v_invoice_status text;
  v_invoice_total numeric;
  v_new_paid numeric;
  v_new_status text;
  v_new_balance numeric;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN (false, 'unauthenticated', 'You must be signed in.')::public.deletion_result;
  END IF;

  IF p_ip_address IS NOT NULL THEN
    v_attempt_count := public.check_rate_limit('delete-attempt:' || p_ip_address, 10, 600);
    IF v_attempt_count > 10 THEN
      PERFORM public.log_deletion_event(
        'rate_limited', 'payments', p_payment_id, p_ip_address, p_user_agent, false,
        jsonb_build_object('reason', 'too_many_attempts')
      );
      RETURN (false, 'rate_limited', 'Too many deletion attempts. Please try again later.')::public.deletion_result;
    END IF;
  END IF;

  IF NOT public.verify_deletion_password(p_password) THEN
    PERFORM public.log_deletion_event(
      'failed_attempt', 'payments', p_payment_id, p_ip_address, p_user_agent, false,
      jsonb_build_object('reason', 'wrong_password')
    );
    RETURN (false, 'wrong_password', 'Deletion password is incorrect.')::public.deletion_result;
  END IF;

  v_success_count := public.check_rate_limit('delete-success:' || v_user_id::text, 3, 600);
  IF v_success_count > 3 THEN
    PERFORM public.log_deletion_event(
      'rate_limited', 'payments', p_payment_id, p_ip_address, p_user_agent, false,
      jsonb_build_object('reason', 'per_user_limit')
    );
    RETURN (false, 'rate_limited', 'Deletion limit reached. Please try again later.')::public.deletion_result;
  END IF;

  v_global_count := public.check_rate_limit('delete-success:global', 10, 600);
  IF v_global_count > 10 THEN
    PERFORM public.log_deletion_event(
      'rate_limited', 'payments', p_payment_id, p_ip_address, p_user_agent, false,
      jsonb_build_object('reason', 'global_limit')
    );
    RETURN (false, 'rate_limited', 'Global deletion limit reached. Please try again later.')::public.deletion_result;
  END IF;

  -- Capture payment details before the soft-delete.
  SELECT * INTO v_payment
    FROM public.payments
   WHERE id = p_payment_id
     AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RETURN (false, 'not_found', 'Payment not found.')::public.deletion_result;
  END IF;

  IF NOT public.user_can_delete_payment(v_user_id, p_payment_id) THEN
    RETURN (false, 'unauthorized', 'You are not allowed to delete this payment.')::public.deletion_result;
  END IF;

  -- Soft-delete the payment.
  UPDATE public.payments
     SET deleted_at = now()
   WHERE id = p_payment_id
     AND deleted_at IS NULL;

  -- Wallet allocation reversal: restore the client account balance and
  -- append a reversal row to the ledger.
  IF v_payment.source = 'client_account' THEN
    SELECT client_id INTO v_client_id
      FROM public.invoices
     WHERE id = v_payment.invoice_id;

    IF v_client_id IS NOT NULL THEN
      UPDATE public.clients
         SET account_balance = account_balance + v_payment.amount,
             updated_at = now()
       WHERE id = v_client_id
       RETURNING account_balance INTO v_new_balance;

      INSERT INTO public.client_account_transactions (
        client_id, type, amount, running_balance, invoice_id, payment_id, method, notes,
        verified_by, verified_at, created_by
      ) VALUES (
        v_client_id,
        'reversal',
        v_payment.amount,
        v_new_balance,
        v_payment.invoice_id,
        v_payment.id,
        'other',
        'Reversal of deleted wallet allocation',
        v_user_id,
        now(),
        v_user_id
      );

      PERFORM public.log_client_account_action(
        'reversal', v_client_id, ARRAY[v_payment.invoice_id], v_payment.amount,
        NULL, p_ip_address, p_user_agent,
        jsonb_build_object('payment_id', v_payment.id, 'reason', 'soft_delete_payment')
      );
    END IF;
  END IF;

  -- Recompute the parent invoice's amount_paid and status from the remaining
  -- non-deleted payments. Skip if the invoice itself has been soft-deleted.
  v_invoice_id := v_payment.invoice_id;

  SELECT status, total
    INTO v_invoice_status, v_invoice_total
    FROM public.invoices
   WHERE id = v_invoice_id
     AND deleted_at IS NULL;

  IF FOUND THEN
    SELECT COALESCE(SUM(amount), 0) INTO v_new_paid
      FROM public.payments
     WHERE invoice_id = v_invoice_id
       AND deleted_at IS NULL;

    v_new_status := CASE
      WHEN v_invoice_total > 0 AND v_new_paid >= v_invoice_total THEN 'paid'
      WHEN v_new_paid > 0 THEN 'partial'
      WHEN v_invoice_status = 'draft' THEN 'draft'
      ELSE 'sent'
    END;

    UPDATE public.invoices
       SET amount_paid = v_new_paid,
           status = v_new_status,
           updated_at = now()
     WHERE id = v_invoice_id;
  END IF;

  PERFORM public.log_deletion_event(
    'soft_delete', 'payments', p_payment_id, p_ip_address, p_user_agent, true, NULL
  );

  RETURN (true, NULL, 'Payment deleted.')::public.deletion_result;
END;
$$;

-- ---------------------------------------------------------------------------
-- D. Grants
-- ---------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.soft_delete_payment(uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_client_account_action(text, uuid, uuid[], numeric, text, text, text, jsonb) TO authenticated;
GRANT SELECT ON public.client_account_audit_log TO authenticated;
