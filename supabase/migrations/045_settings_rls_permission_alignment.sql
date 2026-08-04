-- =============================================================================
-- Star Hawk Builders Merchant — 045_settings_rls_permission_alignment.sql
-- =============================================================================
-- Aligns the database RLS layer with the staff permission JSONB flags defined
-- in lib/auth/permissions.ts. Previously the application layer allowed staff
-- with settings_edit_company / settings_manage_team to act, but the underlying
-- RLS policies (and the profile-update trigger) rejected those actions because
-- they only recognised the "admin" role. This migration fixes that mismatch.
--
-- Changes:
--   1. Adds public.has_staff_permission(p_permission text) helper.
--   2. Allows staff with settings_edit_company to write company_settings and
--      company_bank_details.
--   3. Allows staff with settings_manage_team to SELECT and UPDATE (role only)
--      staff/admin profiles.
--   4. Tightens enforce_profile_update_scope so email, permissions and
--      account_number can only be changed by admins (or by the owner on
--      themselves), while role changes remain permitted for team managers.
--   5. Allows staff with settings_edit_company to upload/replace/delete logo
--      files in the storage.logos bucket.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Helper: does the current authenticated user have a given staff permission?
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.has_staff_permission(p_permission text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT p.role = 'admin'
         OR (p.role = 'staff' AND (p.permissions->>p_permission)::boolean = true)
      FROM public.profiles p
      WHERE p.id = auth.uid()
    ),
    false
  );
$$;

GRANT EXECUTE ON FUNCTION public.has_staff_permission(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_staff_permission(text) TO service_role;


-- -----------------------------------------------------------------------------
-- 2. company_settings: allow settings_edit_company, not just admins.
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS company_settings_write ON public.company_settings;
CREATE POLICY company_settings_write ON public.company_settings
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin() OR public.has_staff_permission('settings_edit_company')
  );

DROP POLICY IF EXISTS company_settings_update ON public.company_settings;
CREATE POLICY company_settings_update ON public.company_settings
  FOR UPDATE TO authenticated
  USING (
    public.is_admin() OR public.has_staff_permission('settings_edit_company')
  )
  WITH CHECK (
    public.is_admin() OR public.has_staff_permission('settings_edit_company')
  );


-- -----------------------------------------------------------------------------
-- 3. company_bank_details: allow settings_edit_company, not just admins.
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS company_bank_update ON public.company_bank_details;
CREATE POLICY company_bank_update ON public.company_bank_details
  FOR UPDATE TO authenticated
  USING (
    public.is_admin() OR public.has_staff_permission('settings_edit_company')
  )
  WITH CHECK (
    public.is_admin() OR public.has_staff_permission('settings_edit_company')
  );

DROP POLICY IF EXISTS company_bank_insert ON public.company_bank_details;
CREATE POLICY company_bank_insert ON public.company_bank_details
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin() OR public.has_staff_permission('settings_edit_company')
  );


-- -----------------------------------------------------------------------------
-- 4. profiles: allow settings_manage_team to see and update staff/admin rows.
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS profiles_select_self_or_admin ON public.profiles;
CREATE POLICY profiles_select_self_or_admin ON public.profiles
  FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR public.is_admin()
    OR (
      public.has_staff_permission('settings_manage_team')
      AND role IN ('admin', 'staff')
    )
  );

DROP POLICY IF EXISTS profiles_update_self_or_admin ON public.profiles;
CREATE POLICY profiles_update_self_or_admin ON public.profiles
  FOR UPDATE TO authenticated
  USING (
    id = auth.uid()
    OR public.is_admin()
    OR (
      public.has_staff_permission('settings_manage_team')
      AND role IN ('admin', 'staff')
    )
  )
  WITH CHECK (
    id = auth.uid()
    OR public.is_admin()
    OR (
      public.has_staff_permission('settings_manage_team')
      AND role IN ('admin', 'staff')
    )
  );


-- -----------------------------------------------------------------------------
-- 5. Trigger: permit team managers to change role, keep sensitive fields admin.
-- -----------------------------------------------------------------------------
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


-- -----------------------------------------------------------------------------
-- 6. storage.logos: allow settings_edit_company, not just admins.
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admin insert on logos" ON storage.objects;
DROP POLICY IF EXISTS "Admin or company-editor insert on logos" ON storage.objects;
CREATE POLICY "Admin or company-editor insert on logos"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'logos'
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND (
        role = 'admin'
        OR (role = 'staff' AND (permissions->>'settings_edit_company')::boolean = true)
      )
  )
);

DROP POLICY IF EXISTS "Admin update on logos" ON storage.objects;
DROP POLICY IF EXISTS "Admin or company-editor update on logos" ON storage.objects;
CREATE POLICY "Admin or company-editor update on logos"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'logos'
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND (
        role = 'admin'
        OR (role = 'staff' AND (permissions->>'settings_edit_company')::boolean = true)
      )
  )
)
WITH CHECK (bucket_id = 'logos');

DROP POLICY IF EXISTS "Admin delete on logos" ON storage.objects;
DROP POLICY IF EXISTS "Admin or company-editor delete on logos" ON storage.objects;
CREATE POLICY "Admin or company-editor delete on logos"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'logos'
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND (
        role = 'admin'
        OR (role = 'staff' AND (permissions->>'settings_edit_company')::boolean = true)
      )
  )
);
