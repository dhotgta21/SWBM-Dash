-- =============================================================================
-- Star Hawk Builders Merchant — 021_client_portal.sql
-- =============================================================================
-- Adds the client-facing portal that lets a customer sign in to view their
-- own invoices and payment status. Three pieces:
--
--   1. profiles
--        - role now allows 'client' (in addition to 'admin' / 'staff')
--        - new client_id column links an auth user to a single clients row
--
--   2. client_invitations
--        - single-use, time-boxed invite tokens issued by an admin
--        - one row per invite attempt; latest wins, prior rows stay as audit
--
--   3. RLS updates
--        - a 'client' profile may SELECT only invoices / items / payments
--          where invoices.client_id matches the profile's client_id
--        - client_invitations is admin-only (server-side lookups via the
--          service-role client for the public accept flow)
--
-- Idempotency: every CREATE / ADD COLUMN / ALTER is guarded so re-running
-- against an already-migrated DB is a no-op.
-- =============================================================================


-- =============================================================================
-- 1. profiles — extend role enum + add client_id link
-- =============================================================================

-- The existing CHECK constraint is auto-named `profiles_role_check` on a
-- fresh DB (no name was given in 001). Drop whatever it is called and
-- recreate with 'client' added. DO-guarded for live DBs.
DO $$
DECLARE
  v_conname text;
BEGIN
  SELECT conname INTO v_conname
  FROM pg_constraint
  WHERE conrelid = 'public.profiles'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%role%';

  IF v_conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.profiles DROP CONSTRAINT %I', v_conname);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_role_valid'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_role_valid
      CHECK (role IN ('admin', 'staff', 'client'));
  END IF;
END $$;

-- profiles.client_id — links the auth user to one client record. NULL for
-- admin / staff (they don't correspond to a customer). DO-guarded FK so
-- re-running against a live DB that already has the column is a no-op.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS client_id uuid;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_client_id_fk'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_client_id_fk
      FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE SET NULL;
  END IF;
END $$;

-- A profile's role and its client_id must agree: only the 'client' role
-- may carry a client_id; admin/staff profiles must have NULL. This stops
-- "I am an admin but my profile secretly belongs to a customer" weird
-- states from creeping in via partial updates.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_role_client_match'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_role_client_match
      CHECK (
        (role = 'client' AND client_id IS NOT NULL)
        OR
        (role <> 'client' AND client_id IS NULL)
      );
  END IF;
END $$;

-- Only one profile per client. A given client record can only be linked
-- to exactly one auth user. Without this, two operators could each link
-- their own profile to the same client and the RLS would let both of
-- them see the client's invoices.
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_client_id_unique
  ON public.profiles(client_id)
  WHERE client_id IS NOT NULL;


-- =============================================================================
-- 2. client_invitations — admin-issued, single-use invite tokens
-- =============================================================================
-- Lifecycle:
--   pending → accepted   (client clicked the link and finished set-password)
--   pending → revoked    (admin cancelled before it was used)
--   pending → expired    (expires_at passed without acceptance; cron can sweep)
--
-- We do NOT issue a new invite to the same client if a pending one still
-- exists — re-using the same row keeps the audit trail tidy and stops
-- accidental double-emails. Revoke first to re-issue.
CREATE TABLE IF NOT EXISTS public.client_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  email text NOT NULL,
  token text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
  invited_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  revoked_at timestamptz,
  last_sent_at timestamptz NOT NULL DEFAULT now()
);

-- Token lookup is the hot path for the public accept page.
CREATE UNIQUE INDEX IF NOT EXISTS idx_client_invitations_token
  ON public.client_invitations(token);

-- Per-client list view ("show me what invites are out for this customer").
CREATE INDEX IF NOT EXISTS idx_client_invitations_client_id
  ON public.client_invitations(client_id);

-- Defensive limits on free-text columns (matches the style of
-- rate_limits_key_length in 019).
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'client_invitations_email_length'
  ) THEN
    ALTER TABLE public.client_invitations
      ADD CONSTRAINT client_invitations_email_length
      CHECK (char_length(email) BETWEEN 3 AND 320);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'client_invitations_token_length'
  ) THEN
    ALTER TABLE public.client_invitations
      ADD CONSTRAINT client_invitations_token_length
      CHECK (char_length(token) BETWEEN 16 AND 256);
  END IF;
END $$;

ALTER TABLE public.client_invitations ENABLE ROW LEVEL SECURITY;

-- Admin / staff can list invites for the clients they own (mirrors the
-- clients_select policy: owner or admin). No UPDATE / INSERT policy — those
-- happen via server actions using the service-role client, so RLS doesn't
-- get in the way and we keep the policy surface small.
DROP POLICY IF EXISTS client_invitations_select ON public.client_invitations;
CREATE POLICY client_invitations_select ON public.client_invitations
  FOR SELECT TO authenticated USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.clients c
       WHERE c.id = client_invitations.client_id
         AND c.created_by = auth.uid()
    )
  );


-- =============================================================================
-- 3. RLS — let clients see only their own invoices / items / payments
-- =============================================================================

-- invoices_select: owner OR admin OR (client role AND own client_id).
DROP POLICY IF EXISTS invoices_select ON public.invoices;
CREATE POLICY invoices_select ON public.invoices
  FOR SELECT TO authenticated USING (
    created_by = auth.uid()
    OR public.is_admin()
    OR (
      EXISTS (
        SELECT 1 FROM public.profiles p
         WHERE p.id = auth.uid()
           AND p.role = 'client'
           AND p.client_id = invoices.client_id
      )
    )
  );

-- invoice_items_select: access follows the parent invoice. If the client
-- can see the invoice, they can see its items.
DROP POLICY IF EXISTS invoice_items_select ON public.invoice_items;
CREATE POLICY invoice_items_select ON public.invoice_items
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.invoices i
       WHERE i.id = invoice_items.invoice_id
         AND (
           i.created_by = auth.uid()
           OR public.is_admin()
           OR EXISTS (
             SELECT 1 FROM public.profiles p
              WHERE p.id = auth.uid()
                AND p.role = 'client'
                AND p.client_id = i.client_id
           )
         )
    )
  );

-- payments_select: same — clients can see the payment history of their
-- own invoices (no payment create/update/delete for clients).
DROP POLICY IF EXISTS payments_select ON public.payments;
CREATE POLICY payments_select ON public.payments
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.invoices i
       WHERE i.id = payments.invoice_id
         AND (
           i.created_by = auth.uid()
           OR public.is_admin()
           OR EXISTS (
             SELECT 1 FROM public.profiles p
              WHERE p.id = auth.uid()
                AND p.role = 'client'
                AND p.client_id = i.client_id
           )
         )
    )
  );

-- Tighten INSERT / UPDATE / DELETE so a 'client' profile can never write
-- to the billing tables, regardless of what RLS policies elsewhere might
-- let through. The existing policies are already narrow enough for admin /
-- staff, but adding a defensive role check costs nothing.
DROP POLICY IF EXISTS payments_insert ON public.payments;
CREATE POLICY payments_insert ON public.payments
  FOR INSERT TO authenticated WITH CHECK (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.profiles p
       WHERE p.id = auth.uid() AND p.role <> 'client'
    )
  );

DROP POLICY IF EXISTS payments_update ON public.payments;
CREATE POLICY payments_update ON public.payments
  FOR UPDATE TO authenticated USING (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.profiles p
       WHERE p.id = auth.uid() AND p.role <> 'client'
    )
  );

DROP POLICY IF EXISTS payments_delete ON public.payments;
CREATE POLICY payments_delete ON public.payments
  FOR DELETE TO authenticated USING (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.profiles p
       WHERE p.id = auth.uid() AND p.role <> 'client'
    )
  );


-- =============================================================================
-- 4. Helper: is_client_of(invoice_id) — used by lib/actions/clients.ts /
--    server actions that need a single-line check (e.g. before letting a
--    client download a PDF).
-- =============================================================================
CREATE OR REPLACE FUNCTION public.is_client_of_invoice(p_invoice_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.invoices i
      JOIN public.profiles p
        ON p.client_id = i.client_id
     WHERE i.id = p_invoice_id
       AND p.id = auth.uid()
       AND p.role = 'client'
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_client_of_invoice(uuid) TO authenticated;


-- =============================================================================
-- 5. RLS for clients table — let a 'client' profile read its own record
-- =============================================================================
-- Without this, the portal profile page and the portal home greeting can't
-- fetch the client's name / address / company — the existing clients_select
-- policy is `created_by = auth.uid() OR is_admin()`, but the row was
-- created by an admin (not the client profile), so a 'client' role would
-- always be denied.
--
-- We extend clients_select to also match "the signed-in profile is a
-- 'client' role AND its client_id matches this row's id". The portal
-- layout already verified the signed-in user is a 'client' before they
-- can reach any /portal/* page, so this is just adding the per-row read
-- permission that matches the portal's data model.
DROP POLICY IF EXISTS clients_select ON public.clients;
CREATE POLICY clients_select ON public.clients
  FOR SELECT TO authenticated USING (
    created_by = auth.uid()
    OR public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.profiles p
       WHERE p.id = auth.uid()
         AND p.role = 'client'
         AND p.client_id = clients.id
    )
  );


-- =============================================================================
-- 5. Audit trail — invite lifecycle (send / revoke / accept) is sensitive
--    enough that admins should be able to see who did what and when. Wire
--    write_audit_log() into the table exactly the way it already runs on
--    profiles / invoices / payments.
-- =============================================================================
DROP TRIGGER IF EXISTS audit_client_invitations ON public.client_invitations;
CREATE TRIGGER audit_client_invitations
  AFTER INSERT OR UPDATE OR DELETE ON public.client_invitations
  FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();
