-- 087_profile_permissions_rbac_hardening.sql
-- Harden the enforce_profile_update_scope trigger so that non-admin users
-- cannot escalate privileges by updating their own permissions or account_number.
-- Email self-changes remain allowed; all other sensitive fields remain restricted.

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
    IF NEW.role NOT IN ('admin', 'staff', 'client') OR OLD.role NOT IN ('admin', 'staff', 'client') THEN
      RAISE EXCEPTION 'Invalid role transition.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Permissions and account_number are privileged fields that drive RBAC and
  -- cross-row access. Only administrators (or service_role, handled above) may
  -- change them on any row, including the caller's own row. Allowing a staff
  -- user to edit their own permissions created a privilege-escalation path.
  IF NEW.permissions IS DISTINCT FROM OLD.permissions
     OR NEW.account_number IS DISTINCT FROM OLD.account_number THEN
    IF NOT public.is_admin() THEN
      RAISE EXCEPTION 'Only administrators can change permissions or account number.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Email changes on another user's row are admin-only. A user may still change
  -- their own email address; the application layer should verify the address.
  IF NEW.email IS DISTINCT FROM OLD.email AND OLD.id <> auth.uid() THEN
    IF NOT public.is_admin() THEN
      RAISE EXCEPTION 'Only administrators can change another user''s email.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

GRANT EXECUTE ON FUNCTION public.enforce_profile_update_scope() TO authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_profile_update_scope() TO service_role;

DROP TRIGGER IF EXISTS profiles_enforce_update_scope ON public.profiles;
CREATE TRIGGER profiles_enforce_update_scope
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_profile_update_scope();
