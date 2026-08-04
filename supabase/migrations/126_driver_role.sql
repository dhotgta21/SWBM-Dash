-- =============================================================================
-- 126_driver_role.sql
-- =============================================================================
-- Introduce the 'driver' role (mirroring how 'picker' was added in 108/124).
-- Drivers are registered like any other team member, sign in through the
-- operator login, and are routed to a dedicated phone-friendly /driver area
-- where they see their assigned delivery jobs.
--
--   1. Widen profiles.role CHECK to include 'driver'.
--   2. handle_new_user() honours invited_role = 'driver'.
--   3. enforce_profile_update_scope() allows transitions to/from
--      'picker' and 'driver' (it previously only allowed admin/staff/client,
--      which blocked non-service-role changes to those roles).
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Single role CHECK including driver (idempotent).
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_valid;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'staff', 'client', 'picker', 'driver'));

-- The role-client match constraint already handles any non-client role,
-- so driver (like admin/staff/picker) simply needs client_id IS NULL.

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. handle_new_user honours driver invitations.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account_number text;
  v_role text;
BEGIN
  v_role := COALESCE(NEW.raw_user_meta_data->>'invited_role', 'staff');
  IF v_role NOT IN ('admin', 'staff', 'client', 'picker', 'driver') THEN
    v_role := 'staff';
  END IF;

  v_account_number := public.generate_unique_account_number();

  INSERT INTO public.profiles (id, email, full_name, role, is_active, created_by, account_number)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    v_role,
    true,
    NEW.id,
    v_account_number
  );

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. enforce_profile_update_scope: allow transitions to/from picker & driver.
--    Logic is identical to the previous definition; only the role allow-list
--    is widened so an admin can (de)assign picker/driver without tripping
--    "Invalid role transition." service_role remains fully exempt.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.enforce_profile_update_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- The service-role key is used by server actions for sensitive operations
  -- (e.g. flipping a new invitee to role='client'). Skip all checks for it.
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Only administrators may change client linkage or active status.
  IF NEW.client_id IS DISTINCT FROM OLD.client_id
     OR NEW.is_active IS DISTINCT FROM OLD.is_active THEN
    IF NOT public.is_admin() THEN
      RAISE EXCEPTION 'Only administrators can change client link or active status.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Role changes are admin-only.
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    IF NOT public.is_admin() THEN
      RAISE EXCEPTION 'Only administrators can change role.'
        USING ERRCODE = '42501';
    END IF;
    IF NEW.role NOT IN ('admin', 'staff', 'client', 'picker', 'driver')
       OR OLD.role NOT IN ('admin', 'staff', 'client', 'picker', 'driver') THEN
      RAISE EXCEPTION 'Invalid role transition.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Permissions and account_number are privileged fields.
  IF NEW.permissions IS DISTINCT FROM OLD.permissions
     OR NEW.account_number IS DISTINCT FROM OLD.account_number THEN
    IF NOT public.is_admin() THEN
      RAISE EXCEPTION 'Only administrators can change permissions or account number.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Email changes on another user's row are admin-only.
  IF NEW.email IS DISTINCT FROM OLD.email AND OLD.id <> auth.uid() THEN
    IF NOT public.is_admin() THEN
      RAISE EXCEPTION 'Only administrators can change another user''s email.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger already exists from prior migrations; recreate defensively.
DROP TRIGGER IF EXISTS profiles_enforce_update_scope ON public.profiles;
CREATE TRIGGER profiles_enforce_update_scope
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_profile_update_scope();
