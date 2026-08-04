-- =============================================================================
-- Migration 153: Per-user payment password (record payments)
-- =============================================================================
-- Direct invoice payments currently re-authenticate with the LOGIN password
-- via signInWithPassword. That is inconsistent with wallet actions (client
-- account password) and deletes (deletion password), both of which live under
-- Settings → Security in public.user_security.
--
-- This migration adds a third action password — payment_password_hash — used
-- only when recording a payment (createPayment / mark-as-paid). Fail-closed:
-- until the operator sets one in Settings → Security → Payments, payment
-- recording is rejected with a clear message.
--
-- Pattern mirrors migration 126 (client account password). Fully idempotent.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE public.user_security
  ADD COLUMN IF NOT EXISTS payment_password_hash text;

COMMENT ON COLUMN public.user_security.payment_password_hash IS
  'Per-user bcrypt hash for recording invoice payments (direct / mark-as-paid). Separate from login, client-account, and deletion passwords.';

-- Boolean self-service status — never returns the hash.
CREATE OR REPLACE FUNCTION public.has_payment_password()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT COALESCE(
    (SELECT payment_password_hash IS NOT NULL FROM public.user_security WHERE user_id = auth.uid()),
    false
  );
$$;

CREATE OR REPLACE FUNCTION public.verify_payment_password(p_password text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
VOLATILE
AS $$
DECLARE
  v_hash text;
  v_attempts integer;
BEGIN
  IF auth.role() <> 'service_role' AND auth.uid() IS NOT NULL THEN
    v_attempts := public.check_rate_limit('verify-pay-pwd:' || auth.uid()::text, 20, 600);
    IF v_attempts > 20 THEN
      RETURN false;
    END IF;
  END IF;

  SELECT payment_password_hash INTO v_hash
    FROM public.user_security WHERE user_id = auth.uid();
  IF v_hash IS NULL THEN
    RETURN false;
  END IF;
  RETURN crypt(p_password, v_hash) = v_hash;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_payment_password(p_new_password text)
RETURNS public.deletion_result
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_hash text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN (false, 'unauthorized', 'You must be signed in to set your payment password.')::public.deletion_result;
  END IF;
  IF p_new_password IS NULL OR length(p_new_password) < 8 THEN
    RETURN (false, 'weak_password', 'Password must be at least 8 characters.')::public.deletion_result;
  END IF;

  v_hash := crypt(p_new_password, gen_salt('bf'));

  INSERT INTO public.user_security (user_id, payment_password_hash)
  VALUES (v_uid, v_hash)
  ON CONFLICT (user_id) DO UPDATE
    SET payment_password_hash = EXCLUDED.payment_password_hash,
        updated_at = now();

  PERFORM public.log_deletion_event(
    'password_change', 'user_security', NULL, NULL, NULL, true,
    jsonb_build_object('kind', 'payment', 'operation', 'set')
  );

  RETURN (true, NULL, 'Payment password set successfully.')::public.deletion_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.change_payment_password(
  p_current_password text,
  p_new_password text
)
RETURNS public.deletion_result
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_hash text;
  v_new_hash text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN (false, 'unauthorized', 'You must be signed in to change your payment password.')::public.deletion_result;
  END IF;

  SELECT payment_password_hash INTO v_hash
    FROM public.user_security WHERE user_id = v_uid;

  IF v_hash IS NOT NULL AND NOT public.verify_payment_password(p_current_password) THEN
    PERFORM public.log_deletion_event(
      'failed_attempt', 'user_security', NULL, NULL, NULL, false,
      jsonb_build_object('kind', 'payment', 'reason', 'wrong_password', 'operation', 'change')
    );
    RETURN (false, 'wrong_password', 'Current payment password is incorrect.')::public.deletion_result;
  END IF;

  IF p_new_password IS NULL OR length(p_new_password) < 8 THEN
    RETURN (false, 'weak_password', 'Password must be at least 8 characters.')::public.deletion_result;
  END IF;

  v_new_hash := crypt(p_new_password, gen_salt('bf'));

  INSERT INTO public.user_security (user_id, payment_password_hash)
  VALUES (v_uid, v_new_hash)
  ON CONFLICT (user_id) DO UPDATE
    SET payment_password_hash = EXCLUDED.payment_password_hash,
        updated_at = now();

  PERFORM public.log_deletion_event(
    'password_change', 'user_security', NULL, NULL, NULL, true,
    jsonb_build_object('kind', 'payment', 'operation', 'change')
  );

  RETURN (true, NULL, 'Payment password changed successfully.')::public.deletion_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_reset_payment_password(
  p_user_id uuid,
  p_new_password text
)
RETURNS public.deletion_result
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_hash text;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN (false, 'unauthorized', 'Only admins can reset another user''s payment password.')::public.deletion_result;
  END IF;
  IF p_user_id IS NULL THEN
    RETURN (false, 'invalid_user', 'A target user is required.')::public.deletion_result;
  END IF;
  IF p_new_password IS NULL OR length(p_new_password) < 8 THEN
    RETURN (false, 'weak_password', 'Password must be at least 8 characters.')::public.deletion_result;
  END IF;

  v_hash := crypt(p_new_password, gen_salt('bf'));

  INSERT INTO public.user_security (user_id, payment_password_hash)
  VALUES (p_user_id, v_hash)
  ON CONFLICT (user_id) DO UPDATE
    SET payment_password_hash = EXCLUDED.payment_password_hash,
        updated_at = now();

  PERFORM public.log_deletion_event(
    'password_change', 'user_security', NULL, NULL, NULL, true,
    jsonb_build_object('kind', 'payment', 'operation', 'admin_reset', 'target_user', p_user_id)
  );

  RETURN (true, NULL, 'Payment password reset.')::public.deletion_result;
END;
$$;

-- Lockdown remains: user_security has no direct table grants (migration 126).
-- Grants for the new RPC surface only.
REVOKE EXECUTE ON FUNCTION public.verify_payment_password(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.verify_payment_password(text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.set_payment_password(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_payment_password(text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.change_payment_password(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.change_payment_password(text, text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.has_payment_password() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_payment_password() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.admin_reset_payment_password(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_reset_payment_password(uuid, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.verify_payment_password(text) IS
  'Per-user bcrypt compare of the caller''s own payment password (user_security). Throttled 20/10min. Added in migration 153.';
COMMENT ON FUNCTION public.has_payment_password() IS
  'Returns true when the caller has set a payment password. Never returns the hash.';
