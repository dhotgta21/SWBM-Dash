-- =============================================================================
-- Star Hawk Builders Merchant — 069_company_contact_channels.sql
-- =============================================================================
-- Replaces the single company_settings.phone / company_settings.email columns
-- with two child tables that support up to 4 phone numbers and up to 4 email
-- addresses, each with per-surface visibility flags.
--
-- Changes:
--   1. Creates public.company_phones and public.company_emails.
--   2. Enforces a maximum of 4 rows per settings_id via trigger.
--   3. Seeds each table from the existing company_settings.phone / .email row
--      so current behaviour is preserved after deploy.
--   4. Mirrors company_settings RLS: authenticated read, write restricted to
--      admins or staff with settings_edit_company.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. company_phones
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.company_phones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  settings_id integer NOT NULL DEFAULT 1 REFERENCES public.company_settings(id) ON DELETE CASCADE,
  value text NOT NULL,
  label text,
  is_primary boolean NOT NULL DEFAULT false,
  show_header boolean NOT NULL DEFAULT false,
  show_homepage boolean NOT NULL DEFAULT false,
  show_contact_page boolean NOT NULL DEFAULT false,
  show_footer boolean NOT NULL DEFAULT false,
  show_invoice boolean NOT NULL DEFAULT false,
  show_email boolean NOT NULL DEFAULT false,
  show_auth boolean NOT NULL DEFAULT false,
  sort_order smallint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT company_phones_settings_id_check CHECK (settings_id = 1)
);

COMMENT ON TABLE public.company_phones IS 'Company phone numbers with per-surface visibility flags.';
COMMENT ON COLUMN public.company_phones.value IS 'The phone number, e.g. 07496 185 969.';
COMMENT ON COLUMN public.company_phones.label IS 'Optional human label, e.g. Trade counter, Sales, Deliveries.';
COMMENT ON COLUMN public.company_phones.is_primary IS 'The default number used for backwards-compatible surfaces.';
COMMENT ON COLUMN public.company_phones.show_header IS 'Show in the site/shop header.';
COMMENT ON COLUMN public.company_phones.show_homepage IS 'Show on the public homepage hero/contact sections.';
COMMENT ON COLUMN public.company_phones.show_contact_page IS 'Show on /contact.';
COMMENT ON COLUMN public.company_phones.show_footer IS 'Show in the site/blog footer.';
COMMENT ON COLUMN public.company_phones.show_invoice IS 'Show on invoice PDFs and public invoice views.';
COMMENT ON COLUMN public.company_phones.show_email IS 'Show in email template footers.';
COMMENT ON COLUMN public.company_phones.show_auth IS 'Show on the auth layout trade-counter panel.';

-- -----------------------------------------------------------------------------
-- 2. company_emails
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.company_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  settings_id integer NOT NULL DEFAULT 1 REFERENCES public.company_settings(id) ON DELETE CASCADE,
  value text NOT NULL,
  label text,
  is_primary boolean NOT NULL DEFAULT false,
  show_header boolean NOT NULL DEFAULT false,
  show_homepage boolean NOT NULL DEFAULT false,
  show_contact_page boolean NOT NULL DEFAULT false,
  show_footer boolean NOT NULL DEFAULT false,
  show_invoice boolean NOT NULL DEFAULT false,
  show_email boolean NOT NULL DEFAULT false,
  show_auth boolean NOT NULL DEFAULT false,
  sort_order smallint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT company_emails_settings_id_check CHECK (settings_id = 1)
);

COMMENT ON TABLE public.company_emails IS 'Company email addresses with per-surface visibility flags.';
COMMENT ON COLUMN public.company_emails.value IS 'The email address.';
COMMENT ON COLUMN public.company_emails.label IS 'Optional human label, e.g. Sales, Accounts, Deliveries.';
COMMENT ON COLUMN public.company_emails.is_primary IS 'The default address used for backwards-compatible surfaces.';
COMMENT ON COLUMN public.company_emails.show_header IS 'Show in the site/shop header.';
COMMENT ON COLUMN public.company_emails.show_homepage IS 'Show on the public homepage hero/contact sections.';
COMMENT ON COLUMN public.company_emails.show_contact_page IS 'Show on /contact.';
COMMENT ON COLUMN public.company_emails.show_footer IS 'Show in the site/blog footer.';
COMMENT ON COLUMN public.company_emails.show_invoice IS 'Show on invoice PDFs and public invoice views.';
COMMENT ON COLUMN public.company_emails.show_email IS 'Show in email template footers.';
COMMENT ON COLUMN public.company_emails.show_auth IS 'Show on the auth layout trade-counter panel.';

-- -----------------------------------------------------------------------------
-- 3. Trigger: enforce maximum of 4 rows per settings_id
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_max_company_contact_channels()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  row_count integer;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT COUNT(*) INTO row_count
    FROM public.company_phones
    WHERE settings_id = NEW.settings_id;

    IF row_count >= 4 THEN
      RAISE EXCEPTION 'A maximum of 4 phone numbers is allowed.'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS company_phones_max_rows ON public.company_phones;
CREATE TRIGGER company_phones_max_rows
  BEFORE INSERT ON public.company_phones
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_max_company_contact_channels();

-- Reuse the same function logic for emails (it only references company_phones
-- because the two tables share the same shape; use a dedicated function for
-- emails to keep error messages accurate).
CREATE OR REPLACE FUNCTION public.enforce_max_company_emails()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  row_count integer;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT COUNT(*) INTO row_count
    FROM public.company_emails
    WHERE settings_id = NEW.settings_id;

    IF row_count >= 4 THEN
      RAISE EXCEPTION 'A maximum of 4 email addresses is allowed.'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS company_emails_max_rows ON public.company_emails;
CREATE TRIGGER company_emails_max_rows
  BEFORE INSERT ON public.company_emails
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_max_company_emails();

GRANT EXECUTE ON FUNCTION public.enforce_max_company_contact_channels() TO authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_max_company_contact_channels() TO service_role;
GRANT EXECUTE ON FUNCTION public.enforce_max_company_emails() TO authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_max_company_emails() TO service_role;

-- -----------------------------------------------------------------------------
-- 4. Seed existing single phone/email as primary channels
-- -----------------------------------------------------------------------------
INSERT INTO public.company_phones (settings_id, value, label, is_primary, show_header, show_homepage, show_contact_page, show_footer, show_invoice, show_email, show_auth, sort_order)
SELECT 1, NULLIF(TRIM(phone), ''), 'Main', true, true, true, true, true, true, true, true, 0
FROM public.company_settings
WHERE id = 1
  AND NULLIF(TRIM(phone), '') IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.company_phones WHERE settings_id = 1);

INSERT INTO public.company_emails (settings_id, value, label, is_primary, show_header, show_homepage, show_contact_page, show_footer, show_invoice, show_email, show_auth, sort_order)
SELECT 1, LOWER(NULLIF(TRIM(email), '')), 'Main', true, true, true, true, true, true, true, true, 0
FROM public.company_settings
WHERE id = 1
  AND NULLIF(TRIM(email), '') IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.company_emails WHERE settings_id = 1);

-- -----------------------------------------------------------------------------
-- 5. RLS
-- -----------------------------------------------------------------------------
ALTER TABLE public.company_phones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_emails ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS company_phones_select ON public.company_phones;
CREATE POLICY company_phones_select ON public.company_phones
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS company_phones_insert ON public.company_phones;
CREATE POLICY company_phones_insert ON public.company_phones
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin() OR public.has_staff_permission('settings_edit_company')
  );

DROP POLICY IF EXISTS company_phones_update ON public.company_phones;
CREATE POLICY company_phones_update ON public.company_phones
  FOR UPDATE TO authenticated
  USING (
    public.is_admin() OR public.has_staff_permission('settings_edit_company')
  )
  WITH CHECK (
    public.is_admin() OR public.has_staff_permission('settings_edit_company')
  );

DROP POLICY IF EXISTS company_phones_delete ON public.company_phones;
CREATE POLICY company_phones_delete ON public.company_phones
  FOR DELETE TO authenticated USING (
    public.is_admin() OR public.has_staff_permission('settings_edit_company')
  );

DROP POLICY IF EXISTS company_emails_select ON public.company_emails;
CREATE POLICY company_emails_select ON public.company_emails
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS company_emails_insert ON public.company_emails;
CREATE POLICY company_emails_insert ON public.company_emails
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin() OR public.has_staff_permission('settings_edit_company')
  );

DROP POLICY IF EXISTS company_emails_update ON public.company_emails;
CREATE POLICY company_emails_update ON public.company_emails
  FOR UPDATE TO authenticated
  USING (
    public.is_admin() OR public.has_staff_permission('settings_edit_company')
  )
  WITH CHECK (
    public.is_admin() OR public.has_staff_permission('settings_edit_company')
  );

DROP POLICY IF EXISTS company_emails_delete ON public.company_emails;
CREATE POLICY company_emails_delete ON public.company_emails
  FOR DELETE TO authenticated USING (
    public.is_admin() OR public.has_staff_permission('settings_edit_company')
  );
