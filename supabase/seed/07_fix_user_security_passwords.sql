-- =============================================================================
-- DEMO / partial schema: per-user Security passwords
-- Settings → Security → Payments | Client Account | Data Deletion
--
-- Creates user_security + RPCs when migrations 093/126/153 were never applied.
-- Safe to re-run.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Return type used by change_* password RPCs
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'deletion_result'
  ) THEN
    CREATE TYPE public.deletion_result AS (
      success boolean,
      error_code text,
      message text
    );
  END IF;
END $$;

-- Touch helper
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- No-op rate limit if missing (returns 0 so verify_* never throttles on partial)
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_key text,
  p_max integer,
  p_window_seconds integer
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Minimal always-allow implementation for demo schemas missing migration 125.
  RETURN 0;
END;
$$;

-- No-op audit log if missing
CREATE OR REPLACE FUNCTION public.log_deletion_event(
  p_event_type text,
  p_entity_type text DEFAULT NULL,
  p_entity_id uuid DEFAULT NULL,
  p_actor_id uuid DEFAULT NULL,
  p_payload jsonb DEFAULT NULL,
  p_success boolean DEFAULT true,
  p_meta jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN;
END;
$$;

-- is_admin helper used by admin_reset_*
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin' AND COALESCE(is_active, true)
  );
$$;

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_security (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  deletion_password_hash text,
  client_account_password_hash text,
  payment_password_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_security
  ADD COLUMN IF NOT EXISTS deletion_password_hash text,
  ADD COLUMN IF NOT EXISTS client_account_password_hash text,
  ADD COLUMN IF NOT EXISTS payment_password_hash text;

ALTER TABLE public.user_security ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS user_security_touch_updated_at ON public.user_security;
CREATE TRIGGER user_security_touch_updated_at
  BEFORE UPDATE ON public.user_security
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

REVOKE ALL ON public.user_security FROM authenticated, anon, service_role;

-- ---------------------------------------------------------------------------
-- Deletion password
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.has_deletion_password()
RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT COALESCE(
    (SELECT deletion_password_hash IS NOT NULL FROM public.user_security WHERE user_id = auth.uid()),
    false
  );
$$;

CREATE OR REPLACE FUNCTION public.verify_deletion_password(p_password text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions VOLATILE AS $$
DECLARE v_hash text; v_attempts integer;
BEGIN
  IF auth.role() <> 'service_role' AND auth.uid() IS NOT NULL THEN
    v_attempts := public.check_rate_limit('verify-del-pwd:' || auth.uid()::text, 20, 600);
    IF v_attempts > 20 THEN RETURN false; END IF;
  END IF;
  SELECT deletion_password_hash INTO v_hash FROM public.user_security WHERE user_id = auth.uid();
  IF v_hash IS NULL THEN RETURN false; END IF;
  RETURN crypt(p_password, v_hash) = v_hash;
END;
$$;

CREATE OR REPLACE FUNCTION public.change_deletion_password(p_current_password text, p_new_password text)
RETURNS public.deletion_result
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_uid uuid := auth.uid(); v_hash text; v_new_hash text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN (false, 'unauthorized', 'You must be signed in to change your deletion password.')::public.deletion_result;
  END IF;
  SELECT deletion_password_hash INTO v_hash FROM public.user_security WHERE user_id = v_uid;
  IF v_hash IS NOT NULL AND NOT public.verify_deletion_password(p_current_password) THEN
    RETURN (false, 'wrong_password', 'Current deletion password is incorrect.')::public.deletion_result;
  END IF;
  IF p_new_password IS NULL OR length(p_new_password) < 8 THEN
    RETURN (false, 'weak_password', 'Password must be at least 8 characters.')::public.deletion_result;
  END IF;
  v_new_hash := crypt(p_new_password, gen_salt('bf'));
  INSERT INTO public.user_security (user_id, deletion_password_hash)
  VALUES (v_uid, v_new_hash)
  ON CONFLICT (user_id) DO UPDATE
    SET deletion_password_hash = EXCLUDED.deletion_password_hash, updated_at = now();
  RETURN (true, NULL, 'Deletion password changed successfully.')::public.deletion_result;
END;
$$;

-- ---------------------------------------------------------------------------
-- Client account password
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.has_client_account_password()
RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT COALESCE(
    (SELECT client_account_password_hash IS NOT NULL FROM public.user_security WHERE user_id = auth.uid()),
    false
  );
$$;

CREATE OR REPLACE FUNCTION public.verify_client_account_password(p_password text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions VOLATILE AS $$
DECLARE v_hash text; v_attempts integer;
BEGIN
  IF auth.role() <> 'service_role' AND auth.uid() IS NOT NULL THEN
    v_attempts := public.check_rate_limit('verify-ca-pwd:' || auth.uid()::text, 20, 600);
    IF v_attempts > 20 THEN RETURN false; END IF;
  END IF;
  SELECT client_account_password_hash INTO v_hash FROM public.user_security WHERE user_id = auth.uid();
  IF v_hash IS NULL THEN RETURN false; END IF;
  RETURN crypt(p_password, v_hash) = v_hash;
END;
$$;

CREATE OR REPLACE FUNCTION public.change_client_account_password(p_current_password text, p_new_password text)
RETURNS public.deletion_result
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_uid uuid := auth.uid(); v_hash text; v_new_hash text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN (false, 'unauthorized', 'You must be signed in to change your client account password.')::public.deletion_result;
  END IF;
  SELECT client_account_password_hash INTO v_hash FROM public.user_security WHERE user_id = v_uid;
  IF v_hash IS NOT NULL AND NOT public.verify_client_account_password(p_current_password) THEN
    RETURN (false, 'wrong_password', 'Current client account password is incorrect.')::public.deletion_result;
  END IF;
  IF p_new_password IS NULL OR length(p_new_password) < 8 THEN
    RETURN (false, 'weak_password', 'Password must be at least 8 characters.')::public.deletion_result;
  END IF;
  v_new_hash := crypt(p_new_password, gen_salt('bf'));
  INSERT INTO public.user_security (user_id, client_account_password_hash)
  VALUES (v_uid, v_new_hash)
  ON CONFLICT (user_id) DO UPDATE
    SET client_account_password_hash = EXCLUDED.client_account_password_hash, updated_at = now();
  RETURN (true, NULL, 'Client account password changed successfully.')::public.deletion_result;
END;
$$;

-- ---------------------------------------------------------------------------
-- Payment password
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.has_payment_password()
RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT COALESCE(
    (SELECT payment_password_hash IS NOT NULL FROM public.user_security WHERE user_id = auth.uid()),
    false
  );
$$;

CREATE OR REPLACE FUNCTION public.verify_payment_password(p_password text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions VOLATILE AS $$
DECLARE v_hash text; v_attempts integer;
BEGIN
  IF auth.role() <> 'service_role' AND auth.uid() IS NOT NULL THEN
    v_attempts := public.check_rate_limit('verify-pay-pwd:' || auth.uid()::text, 20, 600);
    IF v_attempts > 20 THEN RETURN false; END IF;
  END IF;
  SELECT payment_password_hash INTO v_hash FROM public.user_security WHERE user_id = auth.uid();
  IF v_hash IS NULL THEN RETURN false; END IF;
  RETURN crypt(p_password, v_hash) = v_hash;
END;
$$;

CREATE OR REPLACE FUNCTION public.change_payment_password(p_current_password text, p_new_password text)
RETURNS public.deletion_result
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_uid uuid := auth.uid(); v_hash text; v_new_hash text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN (false, 'unauthorized', 'You must be signed in to change your payment password.')::public.deletion_result;
  END IF;
  SELECT payment_password_hash INTO v_hash FROM public.user_security WHERE user_id = v_uid;
  IF v_hash IS NOT NULL AND NOT public.verify_payment_password(p_current_password) THEN
    RETURN (false, 'wrong_password', 'Current payment password is incorrect.')::public.deletion_result;
  END IF;
  IF p_new_password IS NULL OR length(p_new_password) < 8 THEN
    RETURN (false, 'weak_password', 'Password must be at least 8 characters.')::public.deletion_result;
  END IF;
  v_new_hash := crypt(p_new_password, gen_salt('bf'));
  INSERT INTO public.user_security (user_id, payment_password_hash)
  VALUES (v_uid, v_new_hash)
  ON CONFLICT (user_id) DO UPDATE
    SET payment_password_hash = EXCLUDED.payment_password_hash, updated_at = now();
  RETURN (true, NULL, 'Payment password changed successfully.')::public.deletion_result;
END;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'has_deletion_password()',
    'verify_deletion_password(text)',
    'change_deletion_password(text,text)',
    'has_client_account_password()',
    'verify_client_account_password(text)',
    'change_client_account_password(text,text)',
    'has_payment_password()',
    'verify_payment_password(text)',
    'change_payment_password(text,text)'
  ]
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM PUBLIC, anon', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated, service_role', fn);
  END LOOP;
END $$;

-- Pre-seed demo staff action passwords (same as login for easy demos)
-- Password: A1b2c3d4@
INSERT INTO public.user_security (
  user_id,
  payment_password_hash,
  client_account_password_hash,
  deletion_password_hash
)
SELECT
  p.id,
  crypt('A1b2c3d4@', gen_salt('bf')),
  crypt('A1b2c3d4@', gen_salt('bf')),
  crypt('A1b2c3d4@', gen_salt('bf'))
FROM public.profiles p
WHERE lower(p.email) IN (
  'admin@demo-builder.com',
  'demo.admin@demo-builder.example'
)
ON CONFLICT (user_id) DO UPDATE SET
  payment_password_hash = EXCLUDED.payment_password_hash,
  client_account_password_hash = EXCLUDED.client_account_password_hash,
  deletion_password_hash = EXCLUDED.deletion_password_hash,
  updated_at = now();

SELECT
  (SELECT count(*) FROM public.user_security) AS security_rows,
  EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'change_payment_password') AS has_pay_rpc,
  EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'change_client_account_password') AS has_ca_rpc,
  EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'change_deletion_password') AS has_del_rpc;
