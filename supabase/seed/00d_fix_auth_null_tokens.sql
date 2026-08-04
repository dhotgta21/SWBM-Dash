-- =============================================================================
-- FIX: Supabase Auth returns 500 "Database error finding users"
-- =============================================================================
-- Cause: auth.users rows created via raw SQL often leave token columns as NULL.
-- GoTrue expects empty strings (''), not NULL. Symptom: listUsers / sign-in
-- all fail with AuthRetryableFetchError message "{}".
--
-- Safe to re-run. Does not change passwords.
-- =============================================================================

UPDATE auth.users SET
  confirmation_token = COALESCE(confirmation_token, ''),
  recovery_token = COALESCE(recovery_token, ''),
  email_change_token_new = COALESCE(email_change_token_new, ''),
  email_change_token_current = COALESCE(email_change_token_current, ''),
  reauthentication_token = COALESCE(reauthentication_token, ''),
  phone_change = COALESCE(phone_change, ''),
  phone_change_token = COALESCE(phone_change_token, ''),
  email_change = COALESCE(email_change, '');

-- Optional: reset demo admin password (uncomment if needed)
-- UPDATE auth.users
--    SET encrypted_password = crypt('A1b2c3d4@', gen_salt('bf')),
--        email_confirmed_at = COALESCE(email_confirmed_at, now())
--  WHERE lower(email) = 'dhotgta@gmail.com';

SELECT email,
       confirmation_token = '' AS confirm_ok,
       recovery_token = '' AS recovery_ok
FROM auth.users;
