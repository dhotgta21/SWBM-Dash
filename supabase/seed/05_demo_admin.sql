-- =============================================================================
-- DEMO: ensure staff admin login dhotgta@gmail.com
-- =============================================================================
-- Run in Supabase SQL Editor anytime.
--
-- Login:
--   URL:      /admin-login
--   Email:    dhotgta@gmail.com
--   Password: A1b2c3d4@
--
-- Creates the auth user if missing, sets password, promotes profile to admin.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
DECLARE
  v_email      text := 'dhotgta@gmail.com';
  v_password   text := 'A1b2c3d4@';
  v_user_id    uuid;
  v_instance   uuid;
BEGIN
  SELECT id INTO v_instance FROM auth.instances LIMIT 1;
  IF v_instance IS NULL THEN
    v_instance := '00000000-0000-0000-0000-000000000000'::uuid;
  END IF;

  SELECT id INTO v_user_id
    FROM auth.users
   WHERE lower(email) = lower(v_email)
   LIMIT 1;

  IF v_user_id IS NULL THEN
    v_user_id := gen_random_uuid();

    INSERT INTO auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at,
      is_super_admin,
      is_sso_user,
      is_anonymous
    ) VALUES (
      v_instance,
      v_user_id,
      'authenticated',
      'authenticated',
      v_email,
      crypt(v_password, gen_salt('bf')),
      now(),
      jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
      jsonb_build_object(
        'full_name', 'Demo Admin',
        'invited_role', 'admin',
        'demo_admin', true
      ),
      now(),
      now(),
      false,
      false,
      false
    );

    INSERT INTO auth.identities (
      id,
      user_id,
      identity_data,
      provider,
      provider_id,
      last_sign_in_at,
      created_at,
      updated_at
    ) VALUES (
      gen_random_uuid(),
      v_user_id,
      jsonb_build_object(
        'sub', v_user_id::text,
        'email', v_email,
        'email_verified', true,
        'phone_verified', false
      ),
      'email',
      v_user_id::text,
      now(),
      now(),
      now()
    );

    RAISE NOTICE 'Created auth user %', v_email;
  ELSE
    UPDATE auth.users
       SET encrypted_password = crypt(v_password, gen_salt('bf')),
           email_confirmed_at = COALESCE(email_confirmed_at, now()),
           raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb)
             || jsonb_build_object('full_name', 'Demo Admin', 'demo_admin', true),
           updated_at = now()
     WHERE id = v_user_id;

    IF NOT EXISTS (
      SELECT 1 FROM auth.identities
       WHERE user_id = v_user_id AND provider = 'email'
    ) THEN
      INSERT INTO auth.identities (
        id, user_id, identity_data, provider, provider_id,
        last_sign_in_at, created_at, updated_at
      ) VALUES (
        gen_random_uuid(),
        v_user_id,
        jsonb_build_object(
          'sub', v_user_id::text,
          'email', v_email,
          'email_verified', true
        ),
        'email',
        v_user_id::text,
        now(), now(), now()
      );
    END IF;

    RAISE NOTICE 'Updated password for existing user %', v_email;
  END IF;

  -- Profile: admin (handle_new_user may have created staff)
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = v_user_id) THEN
    UPDATE public.profiles
       SET role = 'admin',
           email = v_email,
           full_name = COALESCE(NULLIF(full_name, ''), 'Demo Admin'),
           is_active = true,
           client_id = NULL,
           failed_sign_in_attempts = 0,
           locked_until = NULL
     WHERE id = v_user_id;
  ELSE
    INSERT INTO public.profiles (
      id, email, full_name, role, is_active, created_by
    ) VALUES (
      v_user_id, v_email, 'Demo Admin', 'admin', true, v_user_id
    );
  END IF;
END $$;

SELECT
  u.email,
  p.role,
  p.is_active,
  u.email_confirmed_at IS NOT NULL AS email_confirmed,
  'A1b2c3d4@' AS password_hint
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE lower(u.email) = 'dhotgta@gmail.com';
