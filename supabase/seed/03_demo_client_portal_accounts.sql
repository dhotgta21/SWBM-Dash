-- =============================================================================
-- DEMO: client portal accounts for every trade client
-- =============================================================================
-- Run AFTER 01_demo_clients_invoices.sql (clients must already exist).
--
-- For each public.clients row that does not already have a portal profile:
--   1. Creates auth.users (email confirmed, fixed demo password)
--   2. handle_new_user() creates a temporary staff profile (if new user)
--   3. Updates profile → role = 'client', client_id linked
--   4. Creates auth.identities so email/password login works
--
-- Client portal login (/login):
--   Email:    clients.email  (e.g. james.smith.1@demo-trade.example)
--   Password: DemoClient1!
--
-- Prerequisites: pgcrypto (enabled below). First admin already registered.
-- Re-run: skips clients that already have role=client + client_id link.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
DECLARE
  r               record;
  v_user_id       uuid;
  v_email         text;
  v_password      text := 'DemoClient1!';
  v_full_name     text;
  v_instance_id   uuid;
  v_created       int := 0;
  v_skipped       int := 0;
  v_failed        int := 0;
  v_role          text;
  v_existing_cid  uuid;
BEGIN
  SELECT id INTO v_instance_id FROM auth.instances LIMIT 1;
  IF v_instance_id IS NULL THEN
    v_instance_id := '00000000-0000-0000-0000-000000000000'::uuid;
  END IF;

  FOR r IN
    SELECT c.id AS client_id,
           c.email,
           c.first_name,
           c.last_name,
           c.company_name
      FROM public.clients c
     WHERE c.email IS NOT NULL
       AND trim(c.email) <> ''
       AND NOT EXISTS (
         SELECT 1
           FROM public.profiles p
          WHERE p.client_id = c.id
            AND p.role = 'client'
       )
     ORDER BY c.created_at NULLS LAST, c.email
  LOOP
    BEGIN
      v_email := lower(trim(r.email));
      v_full_name := trim(concat_ws(' ', r.first_name, r.last_name));
      IF v_full_name = '' THEN
        v_full_name := COALESCE(NULLIF(trim(r.company_name), ''), split_part(v_email, '@', 1));
      END IF;
      v_user_id := NULL;

      SELECT id INTO v_user_id
        FROM auth.users
       WHERE lower(email) = v_email
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
          v_instance_id,
          v_user_id,
          'authenticated',
          'authenticated',
          v_email,
          crypt(v_password, gen_salt('bf')),
          now(),
          jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
          jsonb_build_object(
            'full_name', v_full_name,
            'demo_portal', true
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
      ELSE
        -- Only reset password for obvious demo emails
        IF v_email LIKE '%@demo-trade.example' THEN
          UPDATE auth.users
             SET encrypted_password = crypt(v_password, gen_salt('bf')),
                 email_confirmed_at = COALESCE(email_confirmed_at, now()),
                 raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb)
                   || jsonb_build_object('demo_portal', true, 'full_name', v_full_name),
                 updated_at = now()
           WHERE id = v_user_id;
        END IF;

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
      END IF;

      -- Profile: convert seed staff → client, or insert if missing
      SELECT role, client_id INTO v_role, v_existing_cid
        FROM public.profiles
       WHERE id = v_user_id;

      IF NOT FOUND THEN
        INSERT INTO public.profiles (
          id, email, full_name, role, client_id, is_active, created_by
        ) VALUES (
          v_user_id, v_email, v_full_name, 'client', r.client_id, true, v_user_id
        );
        v_created := v_created + 1;
      ELSIF v_role IN ('admin', 'picker', 'driver')
         OR (v_role = 'staff' AND v_email NOT LIKE '%@demo-trade.example') THEN
        -- Never convert real operator accounts
        v_skipped := v_skipped + 1;
        RAISE NOTICE 'Skip %: existing operator profile role=%', v_email, v_role;
      ELSIF v_existing_cid IS NOT NULL AND v_existing_cid <> r.client_id THEN
        v_skipped := v_skipped + 1;
        RAISE NOTICE 'Skip %: already linked to another client', v_email;
      ELSE
        UPDATE public.profiles
           SET role = 'client',
               client_id = r.client_id,
               full_name = COALESCE(NULLIF(full_name, ''), v_full_name),
               email = v_email,
               is_active = true
         WHERE id = v_user_id;
        v_created := v_created + 1;
      END IF;

    EXCEPTION WHEN OTHERS THEN
      v_failed := v_failed + 1;
      RAISE NOTICE 'Failed portal account for %: %', r.email, SQLERRM;
    END;
  END LOOP;

  RAISE NOTICE 'Portal seed done. linked=%, skipped=%, failed=%',
    v_created, v_skipped, v_failed;
END $$;

-- Summary
SELECT
  (SELECT COUNT(*) FROM public.clients) AS clients,
  (SELECT COUNT(*) FROM public.profiles WHERE role = 'client') AS client_portal_profiles;

-- Sample logins (first 15)
SELECT
  c.company_name,
  c.email AS portal_email,
  'DemoClient1!' AS portal_password
FROM public.clients c
JOIN public.profiles p
  ON p.client_id = c.id
 AND p.role = 'client'
ORDER BY c.company_name
LIMIT 15;
