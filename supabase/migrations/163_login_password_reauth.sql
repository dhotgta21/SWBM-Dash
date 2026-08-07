-- =============================================================================
-- 163_login_password_reauth.sql
-- =============================================================================
-- Product: protected deletes re-verify the operator LOGIN password in the app
-- (verifyOperatorPassword). Soft-delete / restore RPCs must NOT be callable by
-- a normal authenticated JWT with a dummy p_password.
--
-- Model:
--   1. App verifies login password via Supabase Auth.
--   2. App calls these RPCs with the service_role key + p_operator_id = actor.
--   3. EXECUTE is revoked from authenticated/anon; only service_role may call.
--   4. p_password is kept for signature stability but is not a secret check
--      (service_role already proves server trust). Prefer sentinel "reauth".
-- =============================================================================

-- Drop legacy 4-arg overloads so only the service_role 5-arg forms remain.
DROP FUNCTION IF EXISTS public.soft_delete_client(uuid, text, text, text);
DROP FUNCTION IF EXISTS public.soft_delete_product(uuid, text, text, text);
DROP FUNCTION IF EXISTS public.soft_delete_invoice(uuid, text, text, text);
DROP FUNCTION IF EXISTS public.soft_delete_payment(uuid, text, text, text);
DROP FUNCTION IF EXISTS public.restore_client(uuid, text, text, text);
DROP FUNCTION IF EXISTS public.restore_product(uuid, text, text, text);
DROP FUNCTION IF EXISTS public.restore_invoice(uuid, text, text, text);

-- ---------------------------------------------------------------------------
-- soft_delete_client
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.soft_delete_client(
  p_client_id uuid,
  p_password text,
  p_ip_address text DEFAULT NULL,
  p_user_agent text DEFAULT NULL,
  p_operator_id uuid DEFAULT NULL
)
RETURNS public.deletion_result
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_attempt_count integer;
  v_success_count integer;
  v_global_count integer;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RETURN (false, 'unauthorized', 'This action must be performed through the application.')::public.deletion_result;
  END IF;

  v_user_id := p_operator_id;
  IF v_user_id IS NULL THEN
    RETURN (false, 'unauthenticated', 'Operator is required.')::public.deletion_result;
  END IF;

  IF p_ip_address IS NOT NULL THEN
    v_attempt_count := public.check_rate_limit('delete-attempt:' || p_ip_address, 10, 600);
    IF v_attempt_count > 10 THEN
      PERFORM public.log_deletion_event(
        'rate_limited', 'clients', p_client_id, p_ip_address, p_user_agent, false,
        jsonb_build_object('reason', 'too_many_attempts')
      );
      RETURN (false, 'rate_limited', 'Too many deletion attempts. Please try again later.')::public.deletion_result;
    END IF;
  END IF;

  v_success_count := public.check_rate_limit('delete-success:' || v_user_id::text, 3, 600);
  IF v_success_count > 3 THEN
    PERFORM public.log_deletion_event(
      'rate_limited', 'clients', p_client_id, p_ip_address, p_user_agent, false,
      jsonb_build_object('reason', 'per_user_limit')
    );
    RETURN (false, 'rate_limited', 'Deletion limit reached. Please try again later.')::public.deletion_result;
  END IF;

  v_global_count := public.check_rate_limit('delete-success:global', 10, 600);
  IF v_global_count > 10 THEN
    PERFORM public.log_deletion_event(
      'rate_limited', 'clients', p_client_id, p_ip_address, p_user_agent, false,
      jsonb_build_object('reason', 'global_limit')
    );
    RETURN (false, 'rate_limited', 'Global deletion limit reached. Please try again later.')::public.deletion_result;
  END IF;

  IF NOT public.user_can_delete_client(v_user_id, p_client_id) THEN
    RETURN (false, 'unauthorized', 'You are not allowed to delete this client.')::public.deletion_result;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.invoices
    WHERE client_id = p_client_id AND deleted_at IS NULL
  ) THEN
    RETURN (false, 'has_invoices', 'Cannot delete a client that has invoices.')::public.deletion_result;
  END IF;

  UPDATE public.clients
     SET deleted_at = now()
   WHERE id = p_client_id
     AND deleted_at IS NULL;

  PERFORM public.log_deletion_event(
    'soft_delete', 'clients', p_client_id, p_ip_address, p_user_agent, true,
    jsonb_build_object('operator_id', v_user_id)
  );

  RETURN (true, NULL, 'Client deleted.')::public.deletion_result;
END;
$$;

-- ---------------------------------------------------------------------------
-- soft_delete_product
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.soft_delete_product(
  p_product_id uuid,
  p_password text,
  p_ip_address text DEFAULT NULL,
  p_user_agent text DEFAULT NULL,
  p_operator_id uuid DEFAULT NULL
)
RETURNS public.deletion_result
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_attempt_count integer;
  v_success_count integer;
  v_global_count integer;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RETURN (false, 'unauthorized', 'This action must be performed through the application.')::public.deletion_result;
  END IF;

  v_user_id := p_operator_id;
  IF v_user_id IS NULL THEN
    RETURN (false, 'unauthenticated', 'Operator is required.')::public.deletion_result;
  END IF;

  IF p_ip_address IS NOT NULL THEN
    v_attempt_count := public.check_rate_limit('delete-attempt:' || p_ip_address, 10, 600);
    IF v_attempt_count > 10 THEN
      PERFORM public.log_deletion_event(
        'rate_limited', 'products', p_product_id, p_ip_address, p_user_agent, false,
        jsonb_build_object('reason', 'too_many_attempts')
      );
      RETURN (false, 'rate_limited', 'Too many deletion attempts. Please try again later.')::public.deletion_result;
    END IF;
  END IF;

  v_success_count := public.check_rate_limit('delete-success:' || v_user_id::text, 3, 600);
  IF v_success_count > 3 THEN
    PERFORM public.log_deletion_event(
      'rate_limited', 'products', p_product_id, p_ip_address, p_user_agent, false,
      jsonb_build_object('reason', 'per_user_limit')
    );
    RETURN (false, 'rate_limited', 'Deletion limit reached. Please try again later.')::public.deletion_result;
  END IF;

  v_global_count := public.check_rate_limit('delete-success:global', 10, 600);
  IF v_global_count > 10 THEN
    PERFORM public.log_deletion_event(
      'rate_limited', 'products', p_product_id, p_ip_address, p_user_agent, false,
      jsonb_build_object('reason', 'global_limit')
    );
    RETURN (false, 'rate_limited', 'Global deletion limit reached. Please try again later.')::public.deletion_result;
  END IF;

  IF NOT public.user_can_delete_product(v_user_id, p_product_id) THEN
    RETURN (false, 'unauthorized', 'You are not allowed to delete this product.')::public.deletion_result;
  END IF;

  UPDATE public.products
     SET deleted_at = now()
   WHERE id = p_product_id
     AND deleted_at IS NULL;

  PERFORM public.log_deletion_event(
    'soft_delete', 'products', p_product_id, p_ip_address, p_user_agent, true,
    jsonb_build_object('operator_id', v_user_id)
  );

  RETURN (true, NULL, 'Product deleted.')::public.deletion_result;
END;
$$;

-- ---------------------------------------------------------------------------
-- soft_delete_invoice
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.soft_delete_invoice(
  p_invoice_id uuid,
  p_password text,
  p_ip_address text DEFAULT NULL,
  p_user_agent text DEFAULT NULL,
  p_operator_id uuid DEFAULT NULL
)
RETURNS public.deletion_result
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_attempt_count integer;
  v_success_count integer;
  v_global_count integer;
  v_invoice public.invoices%ROWTYPE;
  v_rec RECORD;
  v_is_admin boolean;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RETURN (false, 'unauthorized', 'This action must be performed through the application.')::public.deletion_result;
  END IF;

  v_user_id := p_operator_id;
  IF v_user_id IS NULL THEN
    RETURN (false, 'unauthenticated', 'Operator is required.')::public.deletion_result;
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

  SELECT EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = v_user_id AND p.role = 'admin'
  ) INTO v_is_admin;

  IF (
    v_invoice.status IN ('paid', 'partial', 'converted')
    OR COALESCE(v_invoice.amount_paid, 0) > 0
  ) AND NOT v_is_admin THEN
    RETURN (false, 'protected_status', 'Only admins can delete paid, partial, or converted documents.')::public.deletion_result;
  END IF;

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
  END LOOP;

  UPDATE public.invoices     SET deleted_at = now() WHERE id = p_invoice_id;
  UPDATE public.invoice_items SET deleted_at = now() WHERE invoice_id = p_invoice_id;
  UPDATE public.payments     SET deleted_at = now() WHERE invoice_id = p_invoice_id;

  PERFORM public.log_deletion_event(
    'soft_delete', 'invoices', p_invoice_id, p_ip_address, p_user_agent, true,
    jsonb_build_object('operator_id', v_user_id)
  );

  RETURN (true, NULL, 'Invoice deleted.')::public.deletion_result;
END;
$$;

-- ---------------------------------------------------------------------------
-- soft_delete_payment
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.soft_delete_payment(
  p_payment_id uuid,
  p_password text,
  p_ip_address text DEFAULT NULL,
  p_user_agent text DEFAULT NULL,
  p_operator_id uuid DEFAULT NULL
)
RETURNS public.deletion_result
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
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
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RETURN (false, 'unauthorized', 'This action must be performed through the application.')::public.deletion_result;
  END IF;

  v_user_id := p_operator_id;
  IF v_user_id IS NULL THEN
    RETURN (false, 'unauthenticated', 'Operator is required.')::public.deletion_result;
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

  UPDATE public.payments
     SET deleted_at = now()
   WHERE id = p_payment_id
     AND deleted_at IS NULL;

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
        jsonb_build_object('payment_id', v_payment.id, 'reason', 'soft_delete_payment', 'operator_id', v_user_id)
      );
    END IF;
  END IF;

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
    'soft_delete', 'payments', p_payment_id, p_ip_address, p_user_agent, true,
    jsonb_build_object('operator_id', v_user_id)
  );

  RETURN (true, NULL, 'Payment deleted.')::public.deletion_result;
END;
$$;

-- ---------------------------------------------------------------------------
-- restore_client
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.restore_client(
  p_client_id uuid,
  p_password text,
  p_ip_address text DEFAULT NULL,
  p_user_agent text DEFAULT NULL,
  p_operator_id uuid DEFAULT NULL
)
RETURNS public.deletion_result
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RETURN (false, 'unauthorized', 'This action must be performed through the application.')::public.deletion_result;
  END IF;

  v_user_id := p_operator_id;
  IF v_user_id IS NULL THEN
    RETURN (false, 'unauthenticated', 'Operator is required.')::public.deletion_result;
  END IF;

  IF NOT public.user_can_delete_client(v_user_id, p_client_id) THEN
    RETURN (false, 'unauthorized', 'You are not allowed to restore this client.')::public.deletion_result;
  END IF;

  UPDATE public.clients SET deleted_at = NULL WHERE id = p_client_id;

  PERFORM public.log_deletion_event(
    'restore', 'clients', p_client_id, p_ip_address, p_user_agent, true,
    jsonb_build_object('operator_id', v_user_id)
  );

  RETURN (true, NULL, 'Client restored.')::public.deletion_result;
END;
$$;

-- ---------------------------------------------------------------------------
-- restore_product
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.restore_product(
  p_product_id uuid,
  p_password text,
  p_ip_address text DEFAULT NULL,
  p_user_agent text DEFAULT NULL,
  p_operator_id uuid DEFAULT NULL
)
RETURNS public.deletion_result
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RETURN (false, 'unauthorized', 'This action must be performed through the application.')::public.deletion_result;
  END IF;

  v_user_id := p_operator_id;
  IF v_user_id IS NULL THEN
    RETURN (false, 'unauthenticated', 'Operator is required.')::public.deletion_result;
  END IF;

  IF NOT public.user_can_delete_product(v_user_id, p_product_id) THEN
    RETURN (false, 'unauthorized', 'You are not allowed to restore this product.')::public.deletion_result;
  END IF;

  UPDATE public.products SET deleted_at = NULL WHERE id = p_product_id;

  PERFORM public.log_deletion_event(
    'restore', 'products', p_product_id, p_ip_address, p_user_agent, true,
    jsonb_build_object('operator_id', v_user_id)
  );

  RETURN (true, NULL, 'Product restored.')::public.deletion_result;
END;
$$;

-- ---------------------------------------------------------------------------
-- restore_invoice
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.restore_invoice(
  p_invoice_id uuid,
  p_password text,
  p_ip_address text DEFAULT NULL,
  p_user_agent text DEFAULT NULL,
  p_operator_id uuid DEFAULT NULL
)
RETURNS public.deletion_result
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_rec RECORD;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RETURN (false, 'unauthorized', 'This action must be performed through the application.')::public.deletion_result;
  END IF;

  v_user_id := p_operator_id;
  IF v_user_id IS NULL THEN
    RETURN (false, 'unauthenticated', 'Operator is required.')::public.deletion_result;
  END IF;

  IF NOT public.user_can_delete_invoice(v_user_id, p_invoice_id) THEN
    RETURN (false, 'unauthorized', 'You are not allowed to restore this invoice.')::public.deletion_result;
  END IF;

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
  END LOOP;

  UPDATE public.invoices     SET deleted_at = NULL WHERE id = p_invoice_id;
  UPDATE public.invoice_items SET deleted_at = NULL WHERE invoice_id = p_invoice_id;
  UPDATE public.payments     SET deleted_at = NULL WHERE invoice_id = p_invoice_id;

  PERFORM public.log_deletion_event(
    'restore', 'invoices', p_invoice_id, p_ip_address, p_user_agent, true,
    jsonb_build_object('operator_id', v_user_id)
  );

  RETURN (true, NULL, 'Invoice restored.')::public.deletion_result;
END;
$$;

-- ---------------------------------------------------------------------------
-- Grants: service_role only (browser JWT cannot call these RPCs)
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.soft_delete_client(uuid, text, text, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.soft_delete_product(uuid, text, text, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.soft_delete_invoice(uuid, text, text, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.soft_delete_payment(uuid, text, text, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.restore_client(uuid, text, text, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.restore_product(uuid, text, text, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.restore_invoice(uuid, text, text, text, uuid) FROM PUBLIC, anon, authenticated;

-- Drop old 4-arg overloads if they remain executable (Postgres keeps both).
DO $$
BEGIN
  -- Best-effort revoke on legacy signatures without p_operator_id
  BEGIN
    REVOKE EXECUTE ON FUNCTION public.soft_delete_client(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
  EXCEPTION WHEN undefined_function THEN NULL;
  END;
  BEGIN
    REVOKE EXECUTE ON FUNCTION public.soft_delete_product(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
  EXCEPTION WHEN undefined_function THEN NULL;
  END;
  BEGIN
    REVOKE EXECUTE ON FUNCTION public.soft_delete_invoice(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
  EXCEPTION WHEN undefined_function THEN NULL;
  END;
  BEGIN
    REVOKE EXECUTE ON FUNCTION public.soft_delete_payment(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
  EXCEPTION WHEN undefined_function THEN NULL;
  END;
  BEGIN
    REVOKE EXECUTE ON FUNCTION public.restore_client(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
  EXCEPTION WHEN undefined_function THEN NULL;
  END;
  BEGIN
    REVOKE EXECUTE ON FUNCTION public.restore_product(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
  EXCEPTION WHEN undefined_function THEN NULL;
  END;
  BEGIN
    REVOKE EXECUTE ON FUNCTION public.restore_invoice(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
  EXCEPTION WHEN undefined_function THEN NULL;
  END;
END $$;

GRANT EXECUTE ON FUNCTION public.soft_delete_client(uuid, text, text, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.soft_delete_product(uuid, text, text, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.soft_delete_invoice(uuid, text, text, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.soft_delete_payment(uuid, text, text, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.restore_client(uuid, text, text, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.restore_product(uuid, text, text, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.restore_invoice(uuid, text, text, text, uuid) TO service_role;

COMMENT ON FUNCTION public.soft_delete_invoice(uuid, text, text, text, uuid) IS
  'Soft-delete invoice. service_role only; app supplies p_operator_id after login-password re-auth.';
COMMENT ON FUNCTION public.soft_delete_payment(uuid, text, text, text, uuid) IS
  'Soft-delete payment. service_role only; app supplies p_operator_id after login-password re-auth.';
COMMENT ON FUNCTION public.soft_delete_client(uuid, text, text, text, uuid) IS
  'Soft-delete client. service_role only; app supplies p_operator_id after login-password re-auth.';
COMMENT ON FUNCTION public.soft_delete_product(uuid, text, text, text, uuid) IS
  'Soft-delete product. service_role only; app supplies p_operator_id after login-password re-auth.';
