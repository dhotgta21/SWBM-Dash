-- 050_team_manager_toggle_active.sql
-- Allow team managers with settings_manage_team permission to suspend/resume
-- staff and admin accounts, while keeping client linkage changes admin-only.
-- The existing guard_last_admin_on_deactivate trigger still protects the
-- last active admin from being suspended.

CREATE OR REPLACE FUNCTION public.enforce_profile_update_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Only administrators may change client linkage.
  IF NEW.client_id IS DISTINCT FROM OLD.client_id THEN
    IF NOT public.is_admin() THEN
      RAISE EXCEPTION 'Only administrators can change client link.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Active-status changes are sensitive: admins can always toggle, and team
  -- managers with settings_manage_team can toggle staff/admin accounts.
  -- The guard_last_admin_on_deactivate trigger prevents suspending the last
  -- active admin regardless of who makes the request.
  IF NEW.is_active IS DISTINCT FROM OLD.is_active THEN
    IF NOT public.is_admin() AND NOT public.has_staff_permission('settings_manage_team') THEN
      RAISE EXCEPTION 'Only administrators or team managers can change active status.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Administrators and team managers may change role on staff/admin accounts.
  -- Team managers may only transition between 'admin' and 'staff'.
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    IF NOT public.is_admin() AND NOT public.has_staff_permission('settings_manage_team') THEN
      RAISE EXCEPTION 'Only administrators or team managers can change role.'
        USING ERRCODE = '42501';
    END IF;
    IF NEW.role NOT IN ('admin', 'staff') OR OLD.role NOT IN ('admin', 'staff') THEN
      IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Only administrators can change role to/from client.'
          USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;

  -- Email, permissions and account_number are sensitive. Only admins may change
  -- them on someone else's row; owners may still change their own email.
  IF NEW.email IS DISTINCT FROM OLD.email
     OR NEW.permissions IS DISTINCT FROM OLD.permissions
     OR NEW.account_number IS DISTINCT FROM OLD.account_number THEN
    IF NOT public.is_admin() AND OLD.id <> auth.uid() THEN
      RAISE EXCEPTION 'Only administrators can change email, permissions, or account number on another user.'
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
