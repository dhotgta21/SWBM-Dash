-- =============================================================================
-- Star Hawk Builders Merchant — 126_per_user_action_passwords.sql
-- =============================================================================
-- Converts the single shared deletion password into a PER-USER password and
-- adds a separate PER-USER "client account" password (used to authorise deposits
-- and balance applications on a client's account). Both live in a new locked-
-- down table `public.user_security` (one row per user), mirroring the zero-
-- direct-access posture of `public.app_secrets` (migration 093).
--
--   * Hashes are bcrypt (pgcrypto crypt/gen_salt 'bf'); plaintext is never stored.
--   * `user_security` has ALL privileges revoked from authenticated/anon/
--     service_role, so the SECURITY DEFINER RPCs below are the only surface.
--   * verify_* are per-user throttled (20 attempts / 10 min) like 125.
--   * set/change operate on the caller's OWN row (auth.uid()); admins can reset
--     any user via admin_reset_*.
--   * soft_delete_* / restore_* call verify_deletion_password internally, and
--     auth.uid() reflects the real caller inside SECURITY DEFINER, so every
--     delete/restore automatically becomes per-user with no body changes.
--
-- Cut-over: fail-closed. After this migration no user has either password set;
-- each user must set their own in Settings → Security before money/deletes work.
-- `public.app_secrets` is left in place (deprecated) and no longer read.
--
-- Idempotent: CREATE OR REPLACE / IF NOT EXISTS / REVOKE / GRANT throughout.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ┌───────────────────────────────────────────────────────────────────────────┐
-- │ A. Per-user secrets table                                                 │
-- └───────────────────────────────────────────────────────────────────────────┘

CREATE TABLE IF NOT EXISTS public.user_security (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  deletion_password_hash text,
  client_account_password_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.user_security IS
  'Per-user action passwords (deletion + client-account), stored as bcrypt hashes. Reachable only via the password-verifying SECURITY DEFINER RPCs; direct DML is revoked.';

ALTER TABLE public.user_security ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS user_security_touch_updated_at ON public.user_security;
CREATE TRIGGER user_security_touch_updated_at
  BEFORE UPDATE ON public.user_security
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ┌───────────────────────────────────────────────────────────────────────────┐
-- │ B. Deletion password — now per-user                                       │
-- └───────────────────────────────────────────────────────────────────────────┘

CREATE OR REPLACE FUNCTION public.get_deletion_password_hash()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT deletion_password_hash FROM public.user_security WHERE user_id = auth.uid();
$$;

-- Boolean self-service status check — returns only a boolean, never the hash,
-- so it is safe to expose to the user client (used by Settings → Security).
CREATE OR REPLACE FUNCTION public.has_deletion_password()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT COALESCE(
    (SELECT deletion_password_hash IS NOT NULL FROM public.user_security WHERE user_id = auth.uid()),
    false
  );
$$;

CREATE OR REPLACE FUNCTION public.verify_deletion_password(p_password text)
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
  -- Per-user brute-force throttle (migration 125 posture). service_role is
  -- trusted and skips the counter.
  IF auth.role() <> 'service_role' AND auth.uid() IS NOT NULL THEN
    v_attempts := public.check_rate_limit('verify-del-pwd:' || auth.uid()::text, 20, 600);
    IF v_attempts > 20 THEN
      RETURN false;
    END IF;
  END IF;

  SELECT deletion_password_hash INTO v_hash
    FROM public.user_security WHERE user_id = auth.uid();
  IF v_hash IS NULL THEN
    RETURN false;
  END IF;
  RETURN crypt(p_password, v_hash) = v_hash;
END;
$$;

-- Self-service first-time set of the caller's own deletion password.
CREATE OR REPLACE FUNCTION public.set_deletion_password(p_new_password text)
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
    RETURN (false, 'unauthorized', 'You must be signed in to set your deletion password.')::public.deletion_result;
  END IF;
  IF p_new_password IS NULL OR length(p_new_password) < 8 THEN
    RETURN (false, 'weak_password', 'Password must be at least 8 characters.')::public.deletion_result;
  END IF;

  v_hash := crypt(p_new_password, gen_salt('bf'));

  INSERT INTO public.user_security (user_id, deletion_password_hash)
  VALUES (v_uid, v_hash)
  ON CONFLICT (user_id) DO UPDATE
    SET deletion_password_hash = EXCLUDED.deletion_password_hash,
        updated_at = now();

  PERFORM public.log_deletion_event(
    'password_change', 'user_security', NULL, NULL, NULL, true,
    jsonb_build_object('kind', 'deletion', 'operation', 'set')
  );

  RETURN (true, NULL, 'Deletion password set successfully.')::public.deletion_result;
END;
$$;

-- Self-service change of the caller's own deletion password. Requires the
-- current password when one is already set (first-run: no hash yet → allowed).
CREATE OR REPLACE FUNCTION public.change_deletion_password(
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
    RETURN (false, 'unauthorized', 'You must be signed in to change your deletion password.')::public.deletion_result;
  END IF;

  SELECT deletion_password_hash INTO v_hash
    FROM public.user_security WHERE user_id = v_uid;

  IF v_hash IS NOT NULL AND NOT public.verify_deletion_password(p_current_password) THEN
    PERFORM public.log_deletion_event(
      'failed_attempt', 'user_security', NULL, NULL, NULL, false,
      jsonb_build_object('kind', 'deletion', 'reason', 'wrong_password', 'operation', 'change')
    );
    RETURN (false, 'wrong_password', 'Current deletion password is incorrect.')::public.deletion_result;
  END IF;

  IF p_new_password IS NULL OR length(p_new_password) < 8 THEN
    RETURN (false, 'weak_password', 'Password must be at least 8 characters.')::public.deletion_result;
  END IF;

  v_new_hash := crypt(p_new_password, gen_salt('bf'));

  INSERT INTO public.user_security (user_id, deletion_password_hash)
  VALUES (v_uid, v_new_hash)
  ON CONFLICT (user_id) DO UPDATE
    SET deletion_password_hash = EXCLUDED.deletion_password_hash,
        updated_at = now();

  PERFORM public.log_deletion_event(
    'password_change', 'user_security', NULL, NULL, NULL, true,
    jsonb_build_object('kind', 'deletion', 'operation', 'change')
  );

  RETURN (true, NULL, 'Deletion password changed successfully.')::public.deletion_result;
END;
$$;

-- Admin recovery: reset another user's deletion password.
CREATE OR REPLACE FUNCTION public.admin_reset_deletion_password(
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
    RETURN (false, 'unauthorized', 'Only admins can reset another user''s deletion password.')::public.deletion_result;
  END IF;
  IF p_user_id IS NULL THEN
    RETURN (false, 'invalid_user', 'A target user is required.')::public.deletion_result;
  END IF;
  IF p_new_password IS NULL OR length(p_new_password) < 8 THEN
    RETURN (false, 'weak_password', 'Password must be at least 8 characters.')::public.deletion_result;
  END IF;

  v_hash := crypt(p_new_password, gen_salt('bf'));

  INSERT INTO public.user_security (user_id, deletion_password_hash)
  VALUES (p_user_id, v_hash)
  ON CONFLICT (user_id) DO UPDATE
    SET deletion_password_hash = EXCLUDED.deletion_password_hash,
        updated_at = now();

  PERFORM public.log_deletion_event(
    'password_change', 'user_security', NULL, NULL, NULL, true,
    jsonb_build_object('kind', 'deletion', 'operation', 'admin_reset', 'target_user', p_user_id)
  );

  RETURN (true, NULL, 'Deletion password reset.')::public.deletion_result;
END;
$$;

-- ┌───────────────────────────────────────────────────────────────────────────┐
-- │ C. Client-account password — new, per-user                                │
-- └───────────────────────────────────────────────────────────────────────────┘

CREATE OR REPLACE FUNCTION public.get_client_account_password_hash()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT client_account_password_hash FROM public.user_security WHERE user_id = auth.uid();
$$;

-- Boolean self-service status check — returns only a boolean, never the hash.
CREATE OR REPLACE FUNCTION public.has_client_account_password()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT COALESCE(
    (SELECT client_account_password_hash IS NOT NULL FROM public.user_security WHERE user_id = auth.uid()),
    false
  );
$$;

CREATE OR REPLACE FUNCTION public.verify_client_account_password(p_password text)
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
    v_attempts := public.check_rate_limit('verify-ca-pwd:' || auth.uid()::text, 20, 600);
    IF v_attempts > 20 THEN
      RETURN false;
    END IF;
  END IF;

  SELECT client_account_password_hash INTO v_hash
    FROM public.user_security WHERE user_id = auth.uid();
  IF v_hash IS NULL THEN
    RETURN false;
  END IF;
  RETURN crypt(p_password, v_hash) = v_hash;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_client_account_password(p_new_password text)
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
    RETURN (false, 'unauthorized', 'You must be signed in to set your client account password.')::public.deletion_result;
  END IF;
  IF p_new_password IS NULL OR length(p_new_password) < 8 THEN
    RETURN (false, 'weak_password', 'Password must be at least 8 characters.')::public.deletion_result;
  END IF;

  v_hash := crypt(p_new_password, gen_salt('bf'));

  INSERT INTO public.user_security (user_id, client_account_password_hash)
  VALUES (v_uid, v_hash)
  ON CONFLICT (user_id) DO UPDATE
    SET client_account_password_hash = EXCLUDED.client_account_password_hash,
        updated_at = now();

  PERFORM public.log_deletion_event(
    'password_change', 'user_security', NULL, NULL, NULL, true,
    jsonb_build_object('kind', 'client_account', 'operation', 'set')
  );

  RETURN (true, NULL, 'Client account password set successfully.')::public.deletion_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.change_client_account_password(
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
    RETURN (false, 'unauthorized', 'You must be signed in to change your client account password.')::public.deletion_result;
  END IF;

  SELECT client_account_password_hash INTO v_hash
    FROM public.user_security WHERE user_id = v_uid;

  IF v_hash IS NOT NULL AND NOT public.verify_client_account_password(p_current_password) THEN
    PERFORM public.log_deletion_event(
      'failed_attempt', 'user_security', NULL, NULL, NULL, false,
      jsonb_build_object('kind', 'client_account', 'reason', 'wrong_password', 'operation', 'change')
    );
    RETURN (false, 'wrong_password', 'Current client account password is incorrect.')::public.deletion_result;
  END IF;

  IF p_new_password IS NULL OR length(p_new_password) < 8 THEN
    RETURN (false, 'weak_password', 'Password must be at least 8 characters.')::public.deletion_result;
  END IF;

  v_new_hash := crypt(p_new_password, gen_salt('bf'));

  INSERT INTO public.user_security (user_id, client_account_password_hash)
  VALUES (v_uid, v_new_hash)
  ON CONFLICT (user_id) DO UPDATE
    SET client_account_password_hash = EXCLUDED.client_account_password_hash,
        updated_at = now();

  PERFORM public.log_deletion_event(
    'password_change', 'user_security', NULL, NULL, NULL, true,
    jsonb_build_object('kind', 'client_account', 'operation', 'change')
  );

  RETURN (true, NULL, 'Client account password changed successfully.')::public.deletion_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_reset_client_account_password(
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
    RETURN (false, 'unauthorized', 'Only admins can reset another user''s client account password.')::public.deletion_result;
  END IF;
  IF p_user_id IS NULL THEN
    RETURN (false, 'invalid_user', 'A target user is required.')::public.deletion_result;
  END IF;
  IF p_new_password IS NULL OR length(p_new_password) < 8 THEN
    RETURN (false, 'weak_password', 'Password must be at least 8 characters.')::public.deletion_result;
  END IF;

  v_hash := crypt(p_new_password, gen_salt('bf'));

  INSERT INTO public.user_security (user_id, client_account_password_hash)
  VALUES (p_user_id, v_hash)
  ON CONFLICT (user_id) DO UPDATE
    SET client_account_password_hash = EXCLUDED.client_account_password_hash,
        updated_at = now();

  PERFORM public.log_deletion_event(
    'password_change', 'user_security', NULL, NULL, NULL, true,
    jsonb_build_object('kind', 'client_account', 'operation', 'admin_reset', 'target_user', p_user_id)
  );

  RETURN (true, NULL, 'Client account password reset.')::public.deletion_result;
END;
$$;

-- ┌───────────────────────────────────────────────────────────────────────────┐
-- │ D. Lockdown — user_security is RPC-only                                   │
-- └───────────────────────────────────────────────────────────────────────────┘

REVOKE ALL ON public.user_security FROM authenticated, anon, service_role;

-- ┌───────────────────────────────────────────────────────────────────────────┐
-- │ E. Grants — expose only the safe RPC surface                              │
-- └───────────────────────────────────────────────────────────────────────────┘

-- Deletion password (per-user)
REVOKE EXECUTE ON FUNCTION public.verify_deletion_password(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.verify_deletion_password(text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.set_deletion_password(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_deletion_password(text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.change_deletion_password(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.change_deletion_password(text, text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.get_deletion_password_hash() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_deletion_password_hash() TO service_role;
REVOKE EXECUTE ON FUNCTION public.has_deletion_password() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_deletion_password() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.admin_reset_deletion_password(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_reset_deletion_password(uuid, text) TO authenticated, service_role;

-- Client-account password (per-user)
REVOKE EXECUTE ON FUNCTION public.verify_client_account_password(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.verify_client_account_password(text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.set_client_account_password(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_client_account_password(text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.change_client_account_password(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.change_client_account_password(text, text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.get_client_account_password_hash() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_client_account_password_hash() TO service_role;
REVOKE EXECUTE ON FUNCTION public.has_client_account_password() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_client_account_password() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.admin_reset_client_account_password(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_reset_client_account_password(uuid, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.verify_deletion_password(text) IS
  'Per-user bcrypt compare of the caller''s own deletion password (user_security). Per-user throttled (20/10min). Converted from shared to per-user in migration 126.';
COMMENT ON FUNCTION public.verify_client_account_password(text) IS
  'Per-user bcrypt compare of the caller''s own client-account password. Per-user throttled (20/10min). Added in migration 126.';
