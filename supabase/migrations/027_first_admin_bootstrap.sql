-- =============================================================================
-- Star Hawk Builders Merchant — 027_first_admin_bootstrap.sql
-- =============================================================================
-- Fixes the bootstrap deadlock where the first registered user is created as
-- 'staff' by handle_new_user() and then has no admin-capable path to promote
-- themselves (Settings is admin-only).
--
-- Adds claim_first_admin(p_user_id uuid): an advisory-locked RPC that promotes
-- the given user to admin if and only if the database currently has zero admins.
-- Once any admin exists the function is a permanent no-op (returns false).
--
-- The function is service-role only so it can bypass the
-- profiles_enforce_update_scope trigger's "only admins may change role" guard
-- during the one-time bootstrap window.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.claim_first_admin(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Serialize concurrent bootstrap attempts. The advisory transaction lock
  -- auto-releases at COMMIT, so the EXISTS check below is race-free.
  PERFORM pg_advisory_xact_lock(hashtext('swbm:bootstrap'));

  -- Sealed forever: once any admin exists this is a no-op.
  IF EXISTS (SELECT 1 FROM public.profiles WHERE role = 'admin') THEN
    RETURN false;
  END IF;

  -- p_user_id is required and must match an existing profile.
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'User id is required.' USING ERRCODE = 'P0001';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'User profile not found.' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.profiles
     SET role = 'admin'
   WHERE id = p_user_id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_first_admin(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_first_admin(uuid) TO service_role;
