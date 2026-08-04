-- =============================================================================
-- 124_invite_hardening.sql
-- =============================================================================
-- Follow-ups from the invite deep-dive:
--   1. Make client_invitations.last_sent_at nullable so failed sends do not
--      stamp a success-looking timestamp via DEFAULT now().
--   2. Ensure profiles.role CHECK includes 'picker' (idempotent re-apply of
--      migration 109 in case it was missed).
--   3. Ensure handle_new_user() accepts invited_role = 'picker'.
--   4. Clarify accept_invitation operator-block message (picker included).
-- =============================================================================

-- 1. last_sent_at: null until the email actually succeeds.
ALTER TABLE public.client_invitations
  ALTER COLUMN last_sent_at DROP NOT NULL;

ALTER TABLE public.client_invitations
  ALTER COLUMN last_sent_at DROP DEFAULT;

-- Rows that never completed a send (null) stay null; existing successful
-- sends keep their timestamps.

-- 2. Single role CHECK including picker (idempotent).
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_valid;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'staff', 'client', 'picker'));

-- 3. handle_new_user honours picker invitations.
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
  IF v_role NOT IN ('admin', 'staff', 'client', 'picker') THEN
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

-- 4. accept_invitation: clearer message when blocking operator accounts.
CREATE OR REPLACE FUNCTION public.accept_invitation(p_token text)
RETURNS TABLE (
  user_id uuid,
  client_id uuid,
  invitation_id uuid,
  email text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite public.client_invitations;
  v_user_id uuid;
  v_existing_role text;
  v_existing_client_id uuid;
BEGIN
  SELECT * INTO v_invite
    FROM public.client_invitations
   WHERE token = p_token
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invite not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_invite.status = 'revoked' THEN
    RAISE EXCEPTION 'This invite has been revoked.' USING ERRCODE = 'P0001';
  END IF;
  IF v_invite.status = 'expired' OR v_invite.expires_at < now() THEN
    IF v_invite.status <> 'expired' THEN
      UPDATE public.client_invitations SET status = 'expired' WHERE id = v_invite.id;
    END IF;
    RAISE EXCEPTION 'This invite has expired.' USING ERRCODE = 'P0001';
  END IF;
  IF v_invite.status = 'accepted' THEN
    RAISE EXCEPTION 'This invite has already been used.' USING ERRCODE = 'P0001';
  END IF;

  v_user_id := v_invite.profile_id;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Invite has no resolved user. Call the action layer to resolve the auth user first.'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT role, client_id INTO v_existing_role, v_existing_client_id
    FROM public.profiles WHERE id = v_user_id;

  IF v_existing_role IS NOT NULL AND v_existing_role <> 'client' THEN
    RAISE EXCEPTION 'This email belongs to an existing staff, admin, or picker account and cannot be used for the client portal.'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_existing_role = 'client' AND v_existing_client_id IS NOT NULL THEN
    IF v_existing_client_id = v_invite.client_id THEN
      RAISE EXCEPTION 'This client already has a portal account.'
        USING ERRCODE = 'P0001';
    ELSE
      RAISE EXCEPTION 'This email is already linked to a different client portal account.'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  BEGIN
    UPDATE public.profiles p
       SET role = 'client',
           client_id = v_invite.client_id,
           is_active = true,
           full_name = COALESCE(
             NULLIF(TRIM(COALESCE(c.first_name, '') || ' ' || COALESCE(c.last_name, '')), ''),
             p.full_name
           )
      FROM public.clients c
     WHERE p.id = v_user_id
       AND c.id = v_invite.client_id;
  EXCEPTION
    WHEN unique_violation THEN
      RAISE EXCEPTION 'This client already has a portal account.'
        USING ERRCODE = 'P0001';
  END;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No profile row was updated. The auth user exists but the matching profile is missing — please contact support.'
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.client_invitations
     SET status = 'accepted',
         accepted_at = now()
   WHERE id = v_invite.id
     AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'This invite has already been used.' USING ERRCODE = 'P0001';
  END IF;

  RETURN QUERY SELECT v_user_id, v_invite.client_id, v_invite.id, v_invite.email;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.accept_invitation(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.accept_invitation(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.accept_invitation(text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM authenticated;
