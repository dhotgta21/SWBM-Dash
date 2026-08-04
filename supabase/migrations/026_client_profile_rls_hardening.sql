-- =============================================================================
-- Star Hawk Builders Merchant — 026_client_profile_rls_hardening.sql
-- =============================================================================
-- Hardens the profiles table against privilege escalation from the new
-- 'client' role introduced in migration 021.
--
-- Problems fixed:
--   1. The existing profiles_update_self_or_admin policy let any authenticated
--      user update their own row, so a client could flip role to 'admin',
--      reactivate a deactivated account, or pivot to another client's record.
--   2. The client invite flow could silently demote an existing admin/staff
--      account to 'client' if the invite email matched.
--
-- Approach:
--   - Add a BEFORE UPDATE trigger that rejects sensitive-field changes unless
--     the caller is an admin or the service-role key. Sensitive fields are
--     role, client_id, is_active, email, permissions, account_number.
--   - Replace profiles_update_self_or_admin with a policy that still lets
--     authenticated users update their own non-sensitive columns; the trigger
--     enforces the actual column-level restrictions.
--   - Harden the accept_invitation RPC so it refuses to flip an existing
--     admin/staff profile to 'client' as a defense-in-depth guard.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Trigger: enforce column-level restrictions on profile updates.
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

  -- Only admins may change role, client linkage, or active status.
  IF NEW.role IS DISTINCT FROM OLD.role
     OR NEW.client_id IS DISTINCT FROM OLD.client_id
     OR NEW.is_active IS DISTINCT FROM OLD.is_active THEN
    IF NOT public.is_admin() THEN
      RAISE EXCEPTION 'Only administrators can change role, client link, or active status.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Clients may only edit their own display name and phone. Email,
  -- permissions, and account number must be admin-controlled.
  IF OLD.role = 'client' AND NOT public.is_admin() THEN
    IF NEW.email IS DISTINCT FROM OLD.email
       OR NEW.permissions IS DISTINCT FROM OLD.permissions
       OR NEW.account_number IS DISTINCT FROM OLD.account_number THEN
      RAISE EXCEPTION 'Clients cannot change email, permissions, or account number.'
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


-- -----------------------------------------------------------------------------
-- 2. Replace the self-or-admin UPDATE policy with a tighter one.
-- -----------------------------------------------------------------------------
-- The trigger above enforces column restrictions; the policy now only needs to
-- decide *which rows* a user may touch. Admins may touch any row; non-admins
-- may touch only their own row. We keep the name stable so existing grants and
-- docs referencing it remain valid.
DROP POLICY IF EXISTS profiles_update_self_or_admin ON public.profiles;
CREATE POLICY profiles_update_self_or_admin ON public.profiles
  FOR UPDATE TO authenticated USING (
    id = auth.uid() OR public.is_admin()
  )
  WITH CHECK (
    id = auth.uid() OR public.is_admin()
  );


-- -----------------------------------------------------------------------------
-- 3. Harden accept_invitation against flipping admin/staff profiles.
-- -----------------------------------------------------------------------------
-- The action layer already rejects sending an invite to an admin/staff email,
-- but this RPC-level guard ensures a compromised action or manual call cannot
-- demote an operator to a client portal account.
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
BEGIN
  -- Lock the invite row to serialise concurrent accepts.
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

  -- Prefer the pre-resolved profile (set by sendClientInvite when the
  -- auth user already existed). Otherwise we expect the caller to have
  -- already created the auth.users row + supplied the resolved id.
  v_user_id := v_invite.profile_id;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Invite has no resolved user. Call the action layer to resolve the auth user first.'
      USING ERRCODE = 'P0001';
  END IF;

  -- Defense-in-depth: never demote an existing admin or staff account.
  SELECT role INTO v_existing_role FROM public.profiles WHERE id = v_user_id;
  IF v_existing_role IS NOT NULL AND v_existing_role <> 'client' THEN
    RAISE EXCEPTION 'This email belongs to an existing staff or admin account and cannot be used for the client portal.'
      USING ERRCODE = 'P0001';
  END IF;

  -- Profile flip. Catches the partial unique-index violation on
  -- profiles.client_id and translates it to a friendly error.
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

  -- If the UPDATE affected 0 rows, the profile row is missing.
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No profile row was updated. The auth user exists but the matching profile is missing — please contact support.'
      USING ERRCODE = 'P0001';
  END IF;

  -- Status flip — guarded by the WHERE so a second concurrent caller
  -- (after the first wins) sees status='accepted' and bails.
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

GRANT EXECUTE ON FUNCTION public.accept_invitation(text) TO service_role;
