-- =============================================================================
-- Star Hawk Builders Merchant — 046_employee_profile_fields.sql
-- =============================================================================
-- Adds employee / HR fields to public.profiles so each staff member can record
-- basic employment details in Settings > User profile.
--
-- The existing RLS policies (profiles_update_self_or_admin) and the
-- enforce_profile_update_scope trigger already allow users to update their own
-- non-sensitive columns; only email, permissions, account_number, role,
-- client_id and is_active are guarded. These new columns are therefore editable
-- by the profile owner and by admins/team managers without further changes.
-- =============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS employee_number text,
  ADD COLUMN IF NOT EXISTS date_of_birth date,
  ADD COLUMN IF NOT EXISTS id_security_number text,
  ADD COLUMN IF NOT EXISTS job_title text,
  ADD COLUMN IF NOT EXISTS department text;
