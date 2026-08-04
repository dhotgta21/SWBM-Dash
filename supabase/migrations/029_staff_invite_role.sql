-- =============================================================================
-- Star Hawk Builders Merchant — 029_staff_invite_role.sql
-- =============================================================================
-- Admin invitations sent via lib/actions/staff-invite.ts pass the desired
-- role ('staff' or 'admin') in the new user's metadata. This change makes
-- handle_new_user() honour that metadata while keeping the default 'staff'
-- behaviour for self-registered users.
-- =============================================================================

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
  -- Default to 'staff'. If the admin invited this user with a specific
  -- role (via inviteStaffUser), honour it, but only allow known roles.
  v_role := COALESCE(NEW.raw_user_meta_data->>'invited_role', 'staff');
  IF v_role NOT IN ('admin', 'staff', 'client') THEN
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
