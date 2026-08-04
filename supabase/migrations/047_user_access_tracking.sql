-- 047_user_access_tracking.sql
-- Adds last_sign_in_at / last_active_at to profiles and guards the last admin
-- against deactivation or deletion.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_sign_in_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_active_at timestamptz;

-- New profiles start with no access timestamps; handle_new_user() omits these
-- columns so they default to NULL.

-- Prevent deactivating the last active admin.
CREATE OR REPLACE FUNCTION public.guard_last_admin_on_deactivate()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_admin_count int;
BEGIN
  IF NOT (OLD.role = 'admin' AND OLD.is_active = true AND NEW.is_active = false) THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO v_admin_count
    FROM public.profiles
   WHERE role = 'admin' AND is_active = true AND id <> OLD.id;

  IF v_admin_count = 0 THEN
    RAISE EXCEPTION 'Cannot suspend the last active admin. Promote a replacement first.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_guard_last_admin_on_deactivate ON public.profiles;
CREATE TRIGGER profiles_guard_last_admin_on_deactivate
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_last_admin_on_deactivate();

-- Prevent deleting the last admin.
CREATE OR REPLACE FUNCTION public.guard_last_admin_on_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_admin_count int;
BEGIN
  IF OLD.role <> 'admin' THEN
    RETURN OLD;
  END IF;

  SELECT count(*) INTO v_admin_count
    FROM public.profiles
   WHERE role = 'admin' AND id <> OLD.id;

  IF v_admin_count = 0 THEN
    RAISE EXCEPTION 'Cannot delete the last admin. Promote a replacement first.'
      USING ERRCODE = '42501';
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS profiles_guard_last_admin_on_delete ON public.profiles;
CREATE TRIGGER profiles_guard_last_admin_on_delete
  BEFORE DELETE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_last_admin_on_delete();
