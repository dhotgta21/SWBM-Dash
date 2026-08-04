-- Deep-dive fixes: database-layer hardening for the items addressed in
-- application code during the Phase 1–3 pass.

-- ---------------------------------------------------------------------------
-- 1. Index payments for money-collection queries.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_payments_invoice_id
  ON public.payments (invoice_id);

CREATE INDEX IF NOT EXISTS idx_payments_payment_date
  ON public.payments (payment_date);


-- ---------------------------------------------------------------------------
-- 2. Allow staff with settings_edit_company to replace company contact channels.
-- ---------------------------------------------------------------------------
-- The application-layer settings action now permits this capability, so the
-- SECURITY DEFINER RPC must match that authorization model.
CREATE OR REPLACE FUNCTION public.replace_company_contact_channels(
  p_settings_id integer,
  p_phones jsonb DEFAULT '[]'::jsonb,
  p_emails jsonb DEFAULT '[]'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_staff_permission('settings_edit_company') THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  PERFORM id FROM public.company_settings WHERE id = p_settings_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Company settings not found.' USING ERRCODE = 'P0002';
  END IF;

  DELETE FROM public.company_phones WHERE settings_id = p_settings_id;

  INSERT INTO public.company_phones (
    settings_id, value, label, is_primary, show_header, show_homepage,
    show_contact_page, show_footer, show_invoice, show_email, show_auth, sort_order
  )
  SELECT
    p_settings_id,
    TRIM(v->>'value'),
    NULLIF(TRIM(v->>'label'), ''),
    COALESCE((v->>'is_primary')::boolean, false),
    COALESCE((v->>'show_header')::boolean, false),
    COALESCE((v->>'show_homepage')::boolean, false),
    COALESCE((v->>'show_contact_page')::boolean, false),
    COALESCE((v->>'show_footer')::boolean, false),
    COALESCE((v->>'show_invoice')::boolean, false),
    COALESCE((v->>'show_email')::boolean, false),
    COALESCE((v->>'show_auth')::boolean, false),
    COALESCE((v->>'sort_order')::smallint, 0)
  FROM jsonb_array_elements(p_phones) AS v
  WHERE NULLIF(TRIM(v->>'value'), '') IS NOT NULL;

  DELETE FROM public.company_emails WHERE settings_id = p_settings_id;

  INSERT INTO public.company_emails (
    settings_id, value, label, is_primary, show_header, show_homepage,
    show_contact_page, show_footer, show_invoice, show_email, show_auth, sort_order
  )
  SELECT
    p_settings_id,
    LOWER(TRIM(v->>'value')),
    NULLIF(TRIM(v->>'label'), ''),
    COALESCE((v->>'is_primary')::boolean, false),
    COALESCE((v->>'show_header')::boolean, false),
    COALESCE((v->>'show_homepage')::boolean, false),
    COALESCE((v->>'show_contact_page')::boolean, false),
    COALESCE((v->>'show_footer')::boolean, false),
    COALESCE((v->>'show_invoice')::boolean, false),
    COALESCE((v->>'show_email')::boolean, false),
    COALESCE((v->>'show_auth')::boolean, false),
    COALESCE((v->>'sort_order')::smallint, 0)
  FROM jsonb_array_elements(p_emails) AS v
  WHERE NULLIF(TRIM(v->>'value'), '') IS NOT NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.replace_company_contact_channels(integer, jsonb, jsonb)
  TO authenticated;


-- ---------------------------------------------------------------------------
-- 3. Harden accept_invitation against cross-client profile reassignment.
-- ---------------------------------------------------------------------------
-- The action layer already rejects sending an invite to an email linked to a
-- different client. This RPC-level guard ensures a compromised or manual call
-- cannot move an existing client portal profile from one customer to another.
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

  -- Defense-in-depth: never demote an existing admin or staff account, and
  -- never reassign an existing client profile to a different customer.
  SELECT role, client_id INTO v_existing_role, v_existing_client_id
    FROM public.profiles WHERE id = v_user_id;

  IF v_existing_role IS NOT NULL AND v_existing_role <> 'client' THEN
    RAISE EXCEPTION 'This email belongs to an existing staff or admin account and cannot be used for the client portal.'
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
