-- =============================================================================
-- Star Hawk Builders Merchant — schema.sql
-- =============================================================================
-- Consolidated schema for the invoice system. This is the single source of
-- truth: a fresh database can be brought to the current state by running
-- this file alone. A live database that already has the older 001..018
-- chain applied will see all CREATE / CREATE OR REPLACE / ADD COLUMN IF
-- NOT EXISTS statements become no-ops for objects that already exist.
--
-- Lineage (which older files contributed which pieces):
--   001_initial_schema.sql       — base tables, indexes, sanity CHECKs
--   002_generate_document_number — yearly generate_document_number() (SUPERSEDED by 016)
--   003_payment_triggers         — recompute_invoice_paid(), touch_updated_at(), triggers
--   004_auth_functions_and_rls   — handle_new_user(), is_admin(), RLS, GRANTs
--   005_seed_company_settings    — id=1 seed rows
--   006_seed_products            — starter product catalogue
--   007_add_invoice_delivery_address — invoices.delivery_* columns
--   008_add_invoice_number_search    — document_number_suffix + indexes (SUPERSEDED by 017)
--   009_make_bir_prabh_admin     — DROPPED (one-off backfill, no longer needed)
--   010_add_document_prefixes    — company_settings.invoice_prefix / quotation_prefix
--   011_atomic_invoice_updates   — race-safe handle_new_user, update_invoice_with_items()
--   012_notification_settings    — whatsapp + email_* columns, URL CHECK
--   013_invoice_public_sharing   — invoices.share_token, public_share_enabled
--   014_add_invoice_issue_time   — invoices.issue_time, update_invoice_with_items()
--                                  updated to read it
--   015_profile_account_numbers  — profiles.account_number, generate_unique_account_number(),
--                                  handle_new_user updated to allocate it (backfill loop DROPPED)
--   016_monthly_document_sequences — monthly generate_document_number(), document_sequences.month
--   017_update_invoice_number_search — document_number_suffix rebuilt for the new number format
--   018_update_admin_name_to_prabh_singh — DROPPED (one-off backfill, no longer needed)
--
--   019_security_hardening.sql   — INLINED BELOW:
--                                  · profiles_select_self_or_admin RLS
--                                  · public_share_views.ip_address + .user_agent
--                                  · public.rate_limits + public.check_rate_limit()
--                                  · public.write_audit_log() + audit triggers
--                                  · update_invoice_with_items() switched to auth.uid()
--                                  · invoices_freeze_ownership + company_*_pin_updated_by
--
--   020_admin_role_lockdown.sql  — INLINED BELOW:
--                                  · handle_new_user() always assigns 'staff' (no first-user
--                                    auto-admin)
--                                  · public.promote_to_admin() / public.demote_from_admin()
--                                  · profiles_guard_last_admin trigger
--
--   021_client_portal.sql        — INLINED BELOW (appended at end of file).
--   022_shop.sql                 — INLINED BELOW (appended at end of file):
--                                  quote_requests, quote_request_items, ip_bans,
--                                  ip_email_log and related RPCs.
--   023_staff_permissions.sql    — INLINED BELOW (appended at end of file):
--                                  profiles.permissions* columns and helpers.
--   024_data_integrity_hardening — INLINED BELOW (appended at end of file):
--                                  order_number_sequence, products.created_by,
--                                  accept_invitation(), convert_quote_to_invoice(), etc.
--   025_security_hardening.sql   — INLINED BELOW (appended at end of file):
--                                  rate-limiting helpers, public_share_views hardening.
--   026_client_profile_rls_hardening.sql — INLINED BELOW:
--                                  · enforce_profile_update_scope() trigger
--                                  · tightened profiles_update_self_or_admin policy
--                                  · hardened accept_invitation()
--   027_first_admin_bootstrap.sql — INLINED BELOW: claim_first_admin() RPC + service_role grant
--   028_public_product_reads.sql  — INLINED BELOW: anon SELECT on products
--   029_staff_invite_role.sql     — INLINED BELOW
--   030_remove_public_base_url.sql — INLINED BELOW
--   031_invoice_sharing_defaults.sql — INLINED BELOW: NOT NULL + DEFAULT true on
--                                  public_share_enabled; backfills share_token
--   032_invoice_share_expiry.sql  — INLINED BELOW: share_token_expires_at
--   033_rate_limit_fallback.sql   — INLINED BELOW
--   034_quote_request_rls.sql     — INLINED BELOW
--   035_service_role_public_share_grants.sql — INLINED BELOW:
--                                  GRANT SELECT on the business tables to
--                                  service_role so /invoice/[token] can render.
--   036_payment_on_draft_invoices.sql — INLINED BELOW.
--   037_service_role_client_invitations_grants.sql — INLINED BELOW.
--   038_company_bank_details_insert_policy.sql — INLINED BELOW:
--                                  INSERT policy for company_bank_details so
--                                  upsert works on first save.
--   038_company_registration_number.sql — INLINED BELOW:
--                                  company_settings.company_registration_number.
--                                  (Numbering overlaps 038 because migrations
--                                  are applied alphabetically and both are
--                                  idempotent; keep them in sync with the
--                                  files in supabase/migrations/.)
--   039_company_logos_bucket.sql — INLINED BELOW:
--                                  storage.logos bucket + admin/editor policies.
--   039_service_role_quote_and_ban_grants.sql — INLINED BELOW.
--   040_webmail_quick_link.sql — INLINED BELOW:
--                                  company_settings.webmail_url.
--   041_seo_settings.sql — INLINED BELOW: SEO title/description columns.
--   042_seo_same_as.sql — INLINED BELOW: company_settings.seo_same_as.
--   043_add_product_description_and_image.sql — INLINED BELOW.
--   044_seo_catalog_category_product.sql — INLINED BELOW:
--                                  catalog/category/product SEO templates.
--   045_settings_rls_permission_alignment.sql — INLINED BELOW:
--                                  has_staff_permission(), settings_edit_company
--                                  and settings_manage_team RLS alignment.
--   049_product_seo_fields.sql  — INLINED BELOW: product-level SEO columns.
--   051_product_price_from.sql  — INLINED BELOW: products.price_from column.
--   055_product_seasonality.sql — INLINED BELOW: products.sale_* columns and
--                                 products_sale_price_below_default CHECK.
--   096_campaigns.sql           — INLINED BELOW: campaigns + campaign_products
--                                 tables and public read policies.
--   098_campaigns_admin_policies.sql — INLINED BELOW: admin INSERT/UPDATE/DELETE
--                                 policies for campaigns + campaign_products.
--
-- Idempotency rules followed throughout:
--   - CREATE TABLE / CREATE INDEX use IF NOT EXISTS
--   - CREATE OR REPLACE FUNCTION for function bodies
--   - DROP TRIGGER IF EXISTS / CREATE TRIGGER for trigger definitions
--   - DROP POLICY IF EXISTS / CREATE POLICY for RLS policies
--   - ADD COLUMN IF NOT EXISTS for any column that was added in a later
--     migration, so a drifted live DB converges to the same final shape
--   - DO $$ ... $$ guards for CHECK / UNIQUE constraints that 001 used
-- =============================================================================

-- =============================================================================
-- 0. SHARED TRIGGER HELPERS (must exist before any trigger that references them)
-- =============================================================================
-- touch_updated_at() is used by many BEFORE UPDATE triggers later in this
-- file (company_integration_secrets, invoices, clients, products, …).
-- Define it first so a fresh `schema.sql` run does not fail with:
--   ERROR: 42883: function public.touch_updated_at() does not exist
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- =============================================================================
-- 1. TABLES
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- profiles
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  full_name text,
  role text NOT NULL DEFAULT 'staff' CHECK (role IN ('admin', 'staff', 'client', 'picker')),
  phone text,
  is_active boolean NOT NULL DEFAULT true,
  account_number text,                         -- from 015
  client_id uuid,                              -- from 021: links client role to clients row
  permissions jsonb,                           -- from 023: staff permission flags
  permissions_updated_at timestamptz,          -- from 023
  permissions_updated_by uuid,                 -- from 023
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

-- 021: foreign key from profiles.client_id to clients.id
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS client_id uuid,
  ADD COLUMN IF NOT EXISTS permissions jsonb,
  ADD COLUMN IF NOT EXISTS permissions_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS permissions_updated_by uuid,
  ADD COLUMN IF NOT EXISTS employee_number text,
  ADD COLUMN IF NOT EXISTS date_of_birth date,
  ADD COLUMN IF NOT EXISTS id_security_number text,
  ADD COLUMN IF NOT EXISTS job_title text,
  ADD COLUMN IF NOT EXISTS department text,
  ADD COLUMN IF NOT EXISTS last_sign_in_at timestamptz,  -- from 047
  ADD COLUMN IF NOT EXISTS last_active_at timestamptz,   -- from 047
  ADD COLUMN IF NOT EXISTS failed_sign_in_attempts integer NOT NULL DEFAULT 0, -- from 088
  ADD COLUMN IF NOT EXISTS locked_until timestamptz;      -- from 088

-- NOTE: profiles_client_id_fk is created later in this file, after the
-- public.clients table has been defined.

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

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_client_id_unique
  ON public.profiles(client_id)
  WHERE client_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- company_settings  (single logical row, id = 1)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.company_settings (
  id integer PRIMARY KEY DEFAULT 1,
  company_name text NOT NULL DEFAULT 'Demo Builder Merchant',
  address_line_1 text,
  address_line_2 text,
  town text,
  county text,
  postcode text,
  phone text,
  email text,
  vat_number text,
  default_vat_rate numeric(5,2) NOT NULL DEFAULT 20, -- company-wide default % for new invoices
  company_registration_number text,
  logo_url text,
  invoice_prefix text NOT NULL DEFAULT 'INV',      -- from 010
  quotation_prefix text NOT NULL DEFAULT 'QTE',    -- from 010
  email_from_name text,                            -- from 012
  email_reply_to text,                             -- from 012
  webmail_url text,                                -- from 040
  -- SEO overrides (from 041)
  seo_home_title text,
  seo_home_description text,
  seo_home_keywords text,
  seo_og_title text,
  seo_og_description text,
  seo_shop_title text,
  seo_shop_description text,
  seo_cart_title text,
  seo_cart_description text,
  seo_geo_latitude numeric,
  seo_geo_longitude numeric,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT company_settings_single_row CHECK (id = 1)
);

COMMENT ON COLUMN public.company_settings.seo_home_title IS 'Override for the public home page <title>. Falls back to a generated title if empty.';
COMMENT ON COLUMN public.company_settings.seo_home_description IS 'Override for the public home page meta description. Falls back to a generated description if empty.';
COMMENT ON COLUMN public.company_settings.seo_home_keywords IS 'Comma-separated extra keywords merged with the site-wide default keyword list.';
COMMENT ON COLUMN public.company_settings.seo_og_title IS 'Override for Open Graph / social title on the home page. Falls back to company_name.';
COMMENT ON COLUMN public.company_settings.seo_og_description IS 'Override for Open Graph / social description. Falls back to seo_home_description.';
COMMENT ON COLUMN public.company_settings.seo_shop_title IS 'Override for /shop page title.';
COMMENT ON COLUMN public.company_settings.seo_shop_description IS 'Override for /shop meta description.';
COMMENT ON COLUMN public.company_settings.seo_cart_title IS 'Override for /cart page title.';
COMMENT ON COLUMN public.company_settings.seo_cart_description IS 'Override for /cart meta description.';
COMMENT ON COLUMN public.company_settings.seo_geo_latitude IS 'Optional latitude for LocalBusiness structured data.';
COMMENT ON COLUMN public.company_settings.seo_geo_longitude IS 'Optional longitude for LocalBusiness structured data.';

-- SEO sameAs + catalog/category/product templates (from 042 + 044).
ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS seo_same_as text,
  ADD COLUMN IF NOT EXISTS seo_catalog_title text,
  ADD COLUMN IF NOT EXISTS seo_catalog_description text,
  ADD COLUMN IF NOT EXISTS seo_category_title_template text,
  ADD COLUMN IF NOT EXISTS seo_category_description_template text,
  ADD COLUMN IF NOT EXISTS seo_product_title_template text,
  ADD COLUMN IF NOT EXISTS seo_product_description_template text,
  ADD COLUMN IF NOT EXISTS seo_price_range text;

COMMENT ON COLUMN public.company_settings.seo_same_as IS 'Newline/comma-separated list of social/profile URLs for LocalBusiness sameAs.';

-- ─────────────────────────────────────────────────────────────────────────────
-- company_integration_secrets  (single logical row, id = 1; from 099)
-- ─────────────────────────────────────────────────────────────────────────────
-- Encrypted storage for Resend, Cloudflare Turnstile and GoAddress credentials
-- that are managed from Settings → Integrations. Non-secret fields such as the
-- Turnstile site key and Resend from-address are stored plaintext.
CREATE TABLE IF NOT EXISTS public.company_integration_secrets (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  resend_api_key_encrypted text,
  resend_from_address text,
  turnstile_secret_key_encrypted text,
  turnstile_site_key text,
  goaddress_token_encrypted text,
  resend_api_key_updated_at timestamptz,
  turnstile_secret_key_updated_at timestamptz,
  goaddress_token_updated_at timestamptz,
  rotation_warning_days integer NOT NULL DEFAULT 90,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE SET NULL
);

COMMENT ON TABLE public.company_integration_secrets IS
  'Single-row secret storage for Resend, Turnstile and GoAddress integration credentials. Readable only by the service role; secrets are stored AES-256-GCM encrypted.';
COMMENT ON COLUMN public.company_integration_secrets.resend_api_key_encrypted IS
  'AES-256-GCM ciphertext of the Resend API key. Format: base64url(salt):base64url(iv):base64url(authTag):base64url(ciphertext).';
COMMENT ON COLUMN public.company_integration_secrets.resend_from_address IS
  'Outbound sender address used with Resend. Example: Star Hawk <noreply@starhawk.example>.';
COMMENT ON COLUMN public.company_integration_secrets.turnstile_secret_key_encrypted IS
  'AES-256-GCM ciphertext of the Cloudflare Turnstile secret key.';
COMMENT ON COLUMN public.company_integration_secrets.turnstile_site_key IS
  'Public Cloudflare Turnstile site key rendered by the client widget.';
COMMENT ON COLUMN public.company_integration_secrets.goaddress_token_encrypted IS
  'AES-256-GCM ciphertext of the GoAddress API token.';
COMMENT ON COLUMN public.company_integration_secrets.resend_api_key_updated_at IS
  'Timestamp of the last Resend API key save or clear. Used for rotation warnings.';
COMMENT ON COLUMN public.company_integration_secrets.turnstile_secret_key_updated_at IS
  'Timestamp of the last Turnstile secret key save or clear. Used for rotation warnings.';
COMMENT ON COLUMN public.company_integration_secrets.goaddress_token_updated_at IS
  'Timestamp of the last GoAddress token save or clear. Used for rotation warnings.';
COMMENT ON COLUMN public.company_integration_secrets.rotation_warning_days IS
  'Number of days after which a stored integration secret is flagged as needing rotation.';

INSERT INTO public.company_integration_secrets (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

DROP TRIGGER IF EXISTS trg_company_integration_secrets_updated_at ON public.company_integration_secrets;
CREATE TRIGGER trg_company_integration_secrets_updated_at
  BEFORE UPDATE ON public.company_integration_secrets
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.company_integration_secrets ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_integration_secrets TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- company_phones / company_emails  (from 069)
-- ─────────────────────────────────────────────────────────────────────────────
-- Child tables that hold up to 4 phone numbers and 4 email addresses, each
-- with per-surface visibility flags. The legacy company_settings.phone and
-- company_settings.email columns remain as the synced primary fallback.
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
    SELECT COUNT(*) INTO row_count FROM public.company_phones WHERE settings_id = NEW.settings_id;
    IF row_count >= 4 THEN
      RAISE EXCEPTION 'A maximum of 4 phone numbers is allowed.' USING ERRCODE = '23514';
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
    SELECT COUNT(*) INTO row_count FROM public.company_emails WHERE settings_id = NEW.settings_id;
    IF row_count >= 4 THEN
      RAISE EXCEPTION 'A maximum of 4 email addresses is allowed.' USING ERRCODE = '23514';
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

COMMENT ON TABLE public.company_phones IS 'Company phone numbers with per-surface visibility flags.';
COMMENT ON COLUMN public.company_phones.value IS 'The phone number, e.g. 07496 185 969.';
COMMENT ON COLUMN public.company_phones.label IS 'Optional human label, e.g. Trade counter, Sales, Deliveries.';
COMMENT ON COLUMN public.company_phones.is_primary IS 'The default number used for backwards-compatible surfaces.';

COMMENT ON TABLE public.company_emails IS 'Company email addresses with per-surface visibility flags.';
COMMENT ON COLUMN public.company_emails.value IS 'The email address.';
COMMENT ON COLUMN public.company_emails.label IS 'Optional human label, e.g. Sales, Accounts, Deliveries.';
COMMENT ON COLUMN public.company_emails.is_primary IS 'The default address used for backwards-compatible surfaces.';
COMMENT ON COLUMN public.company_settings.seo_catalog_title IS 'Override for /shop/catalog page title. Falls back to "Full product catalogue | {site}".';
COMMENT ON COLUMN public.company_settings.seo_catalog_description IS 'Override for /shop/catalog meta description.';
COMMENT ON COLUMN public.company_settings.seo_category_title_template IS 'Template for /shop/{slug} title. Supports {category} and {site} placeholders.';
COMMENT ON COLUMN public.company_settings.seo_category_description_template IS 'Template for /shop/{slug} description. Supports {category} and {site} placeholders.';
COMMENT ON COLUMN public.company_settings.seo_product_title_template IS 'Template for /shop/product/{code} title. Supports {product} and {site} placeholders.';
COMMENT ON COLUMN public.company_settings.seo_product_description_template IS 'Template for /shop/product/{code} description. Supports {product}, {category}, and {site} placeholders.';
COMMENT ON COLUMN public.company_settings.seo_price_range IS 'Schema.org priceRange for LocalBusiness (e.g. "££"). Empty = omit.';

-- ─────────────────────────────────────────────────────────────────────────────
-- company_bank_details  (single logical row, id = 1)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.company_bank_details (
  id integer PRIMARY KEY DEFAULT 1,
  bank_name text,
  bank_account_name text,
  sort_code text,
  account_number text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT company_bank_single_row CHECK (id = 1)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- clients
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name text NOT NULL,
  last_name text NOT NULL,
  email text,
  phone text,
  company_name text,
  account_number text,                         -- from 054
  address_line_1 text,
  address_line_2 text,
  town text,
  county text,
  postcode text,
  notes text,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 056: flags for clients created by the AI invoice assistant
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS ai_created boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reviewed boolean NOT NULL DEFAULT true;

-- 144: per-client credit terms — payment terms (days) + credit limit.
-- NULL payment_terms_days = system default (30); NULL credit_limit = no limit.
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS payment_terms_days integer,
  ADD COLUMN IF NOT EXISTS credit_limit numeric(12,2);

-- ─────────────────────────────────────────────────────────────────────────────
-- products
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  name text NOT NULL,
  description text,
  unit text NOT NULL DEFAULT 'EA',
  category text,
  default_price numeric NOT NULL DEFAULT 0,
  image_url text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Unique product code (DO-guarded so it can be re-run / added to a live table).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_code_key') THEN
    ALTER TABLE public.products ADD CONSTRAINT products_code_key UNIQUE (code);
  END IF;
END $$;

-- Product-level SEO and structured-data fields (migrations 049 + 051).
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS seo_title text,
  ADD COLUMN IF NOT EXISTS seo_description text,
  ADD COLUMN IF NOT EXISTS short_description text,
  ADD COLUMN IF NOT EXISTS key_features jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS brand text,
  ADD COLUMN IF NOT EXISTS mpn text,
  ADD COLUMN IF NOT EXISTS applications jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS price_from numeric(12, 2);

-- Product-level calculator metadata (migration 053).
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS length_mm numeric,
  ADD COLUMN IF NOT EXISTS width_mm numeric,
  ADD COLUMN IF NOT EXISTS height_mm numeric,
  ADD COLUMN IF NOT EXISTS thickness_mm numeric,
  ADD COLUMN IF NOT EXISTS coverage_m2_per_unit numeric,
  ADD COLUMN IF NOT EXISTS coverage_linear_m_per_unit numeric,
  ADD COLUMN IF NOT EXISTS unit_weight_kg numeric,
  ADD COLUMN IF NOT EXISTS pack_size integer,
  ADD COLUMN IF NOT EXISTS wastage_pct numeric DEFAULT 5,
  ADD COLUMN IF NOT EXISTS calculator_type text;

-- Product-level seasonality sale columns (migration 055).
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS sale_price numeric(12, 2),
  ADD COLUMN IF NOT EXISTS sale_starts_at timestamptz,
  ADD COLUMN IF NOT EXISTS sale_ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS sale_label text;

COMMENT ON COLUMN public.products.sale_price IS
  'Discounted price during a scheduled sale. null = no sale active. Always stored separately from default_price so the pre-sale price is preserved.';

COMMENT ON COLUMN public.products.sale_starts_at IS
  'When the sale becomes active. null + sale_price set = permanent / clearance. sale_starts_at > sale_ends_at is treated as no sale.';

COMMENT ON COLUMN public.products.sale_ends_at IS
  'When the sale expires. null = no scheduled end. Once now() > sale_ends_at the sale is no longer applied to prices.';

COMMENT ON COLUMN public.products.sale_label IS
  'Free-text campaign name shown next to the sale price (e.g. "Winter Sale", "Clearance"). null = no label.';

-- VAT-inclusive price flag (migration 094).
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS price_includes_vat boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.products.price_includes_vat IS
  'True when the displayed default_price + sale_price already include VAT @ 20%. Default false (trade standard: VAT exclusive). Public PDP adds an "inc. VAT" hint when true.';

-- Soft-delete + temporary/walk-in products (migrations 064 + 093).
-- Required by /admin/products filters (.is('deleted_at', null), .eq('is_temporary', …)).
-- Without these columns PostgREST rejects every catalogue query and the UI
-- shows zero products even when rows exist.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS is_temporary boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS promoted_at timestamptz,
  ADD COLUMN IF NOT EXISTS temp_placeholder_code boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_products_deleted_at
  ON public.products(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_products_is_temporary
  ON public.products(is_temporary) WHERE is_temporary = true;

-- Stock columns used by the Stock tab and invoice picking (migration 110+).
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS track_stock boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stock_quantity numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reorder_level numeric NOT NULL DEFAULT 0;

-- Sanity constraint: a sale_price above the regular price is almost always a
-- data-entry mistake. Refuse it at the DB layer as defence in depth.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'products_sale_price_below_default'
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_sale_price_below_default
      CHECK (
        sale_price IS NULL
        OR default_price IS NULL
        OR sale_price <= default_price
      );
  END IF;
END
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- campaigns (product groups with a shared scheduled discount)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  discount_percent numeric(5,2) NOT NULL CHECK (discount_percent > 0 AND discount_percent <= 100),
  starts_at timestamptz,
  ends_at timestamptz,
  label text,
  is_paused boolean NOT NULL DEFAULT false,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.campaigns IS 'Product folders/groups used to apply a scheduled percentage discount to many products at once.';

CREATE INDEX IF NOT EXISTS idx_campaigns_dates ON public.campaigns(starts_at, ends_at, is_paused);

CREATE TABLE IF NOT EXISTS public.campaign_products (
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (campaign_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_campaign_products_product_id ON public.campaign_products(product_id);

COMMENT ON COLUMN public.campaigns.deleted_at IS 'Soft-delete timestamp; NULL means the campaign is active.';

-- ─────────────────────────────────────────────────────────────────────────────
-- document_sequences  (atomic, per-month document number generation)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.document_sequences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prefix text NOT NULL,
  current_number integer NOT NULL DEFAULT 0,
  year integer NOT NULL,
  month smallint                                -- from 016
);

-- Replace the (prefix, year) unique key with (prefix, year, month) on live DBs.
ALTER TABLE public.document_sequences
  DROP CONSTRAINT IF EXISTS document_sequences_prefix_year_key;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'document_sequences_prefix_year_month_key'
  ) THEN
    ALTER TABLE public.document_sequences
      ADD CONSTRAINT document_sequences_prefix_year_month_key UNIQUE (prefix, year, month);
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- invoices
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL CHECK (type IN ('invoice', 'quotation')),
  document_number text NOT NULL,
  order_number text,
  account_number text,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'draft',
  issue_date date NOT NULL,
  issue_time time,                             -- from 014
  due_date date,
  expiry_date date,
  operator_name text NOT NULL DEFAULT 'System User',
  notes text,
  show_payment_terms boolean NOT NULL DEFAULT false,         -- from 079
  show_watermark boolean NOT NULL DEFAULT true,              -- from 102
  show_paid_watermark boolean NOT NULL DEFAULT true,         -- from 103
  show_partially_paid_watermark boolean NOT NULL DEFAULT true, -- from 103
  show_overdue_watermark boolean NOT NULL DEFAULT true,      -- from 103
  paid_by text,                                             -- from 103
  paid_at timestamptz,                                      -- from 103
  overdue_at timestamptz,                                   -- from 103
  status_stamps_enabled boolean NOT NULL DEFAULT true,      -- from 104
  status_stamps_mode text NOT NULL DEFAULT 'auto'             -- from 104
    CHECK (status_stamps_mode IN ('auto', 'manual')),
  delivery_method text NOT NULL DEFAULT 'delivery'
    CHECK (delivery_method IN ('delivery', 'collection')), -- from 071
  delivery_address_line_1 text,                -- from 007
  delivery_address_line_2 text,                -- from 007
  delivery_town text,                          -- from 007
  delivery_county text,                        -- from 007
  delivery_postcode text,                      -- from 007
  subtotal numeric NOT NULL DEFAULT 0,
  vat_total numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  amount_paid numeric NOT NULL DEFAULT 0,
  balance_due numeric GENERATED ALWAYS AS (total - amount_paid) STORED,
  converted_from_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  share_token uuid DEFAULT gen_random_uuid(),  -- from 013
  public_share_enabled boolean NOT NULL DEFAULT false,  -- from 085
  share_token_expires_at timestamptz,          -- from 032: 7-day link expiry
  share_token_created_at timestamptz NOT NULL DEFAULT now(),  -- from 085
  public_share_key text,                       -- from 092: opaque share URL key
  public_share_requires_password boolean NOT NULL DEFAULT false,  -- from 092
  public_share_password_hash text,             -- from 092
  delivery_note_share_enabled boolean NOT NULL DEFAULT false,  -- from 152: independent DN visibility
  delivery_note_share_requires_password boolean NOT NULL DEFAULT false,  -- from 152
  delivery_note_share_password_hash text,      -- from 152
  your_reference text,                         -- from 054
  document_number_suffix integer              -- from 017 (regenerated with new regex)
    GENERATED ALWAYS AS (
      CASE
        WHEN document_number ~ '^[A-Z]+-[0-9]+-[A-L][0-9]+$'
        THEN CAST(substring(split_part(document_number, '-', 3) FROM 2) AS integer)
        ELSE NULL
      END
    ) STORED,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Unique document number (DO-guarded for re-runnability / live tables).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoices_document_number_key') THEN
    ALTER TABLE public.invoices ADD CONSTRAINT invoices_document_number_key UNIQUE (document_number);
  END IF;
END $$;

-- CRITICAL data-integrity guards (close the concurrent-overpayment race at the
-- DB level). Added only if missing so this is safe on a live table.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoices_amount_paid_sane') THEN
    ALTER TABLE public.invoices
      ADD CONSTRAINT invoices_amount_paid_sane CHECK (amount_paid >= 0 AND amount_paid <= total);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoices_total_nonneg') THEN
    ALTER TABLE public.invoices ADD CONSTRAINT invoices_total_nonneg CHECK (total >= 0);
  END IF;
END $$;

-- share_token: backfill any pre-existing NULLs then enforce NOT NULL.
UPDATE public.invoices SET share_token = gen_random_uuid() WHERE share_token IS NULL;
DO $$ BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'invoices'
      AND column_name = 'share_token'
      AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE public.invoices ALTER COLUMN share_token SET NOT NULL;
  END IF;
END $$;

-- share_token_created_at: backfill from created_at then enforce NOT NULL.
UPDATE public.invoices SET share_token_created_at = COALESCE(created_at, now()) WHERE share_token_created_at IS NULL;
DO $$ BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'invoices'
      AND column_name = 'share_token_created_at'
      AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE public.invoices ALTER COLUMN share_token_created_at SET NOT NULL;
  END IF;
END $$;

-- Unique share_token (DO-guarded).
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'invoices_share_token_key'
  ) THEN
    ALTER TABLE public.invoices ADD CONSTRAINT invoices_share_token_key UNIQUE (share_token);
  END IF;
END $$;

-- Opaque public share key: unique where present, and a fast partial index for active links.
CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_public_share_key_unique
  ON public.invoices(public_share_key)
  WHERE public_share_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_public_share_enabled_key
  ON public.invoices(public_share_key)
  WHERE public_share_enabled = true;
CREATE INDEX IF NOT EXISTS idx_invoices_delivery_note_share_enabled_key
  ON public.invoices(public_share_key)
  WHERE delivery_note_share_enabled = true AND public_share_key IS NOT NULL;

-- A quotation may only be converted into a single invoice. Partial unique
-- index (only enforced where converted_from_id IS NOT NULL).
CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_converted_from_unique
  ON public.invoices(converted_from_id)
  WHERE converted_from_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- invoice_items
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  product_name text NOT NULL,
  product_code text,
  unit text,
  quantity numeric NOT NULL,
  price numeric NOT NULL DEFAULT 0,
  vat_rate numeric NOT NULL DEFAULT 0,
  vat_amount numeric NOT NULL DEFAULT 0,
  line_total numeric NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0
);

-- ─────────────────────────────────────────────────────────────────────────────
-- payments
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  amount numeric NOT NULL,
  payment_date date NOT NULL,
  method text NOT NULL, -- allowed values enforced by payments_method_valid (see below)
  reference text,
  notes text,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Payments must be strictly positive (rejects NaN/null/negative at DB level).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payments_amount_positive') THEN
    ALTER TABLE public.payments ADD CONSTRAINT payments_amount_positive CHECK (amount > 0);
  END IF;
END $$;

-- Allowed payment methods. The original CREATE TABLE inline CHECK is
-- auto-named by Postgres; replace it with a named constraint so we can
-- extend it (e.g. e-COD) without re-creating the table.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'payments_method_check'
      AND conrelid = 'public.payments'::regclass
  ) THEN
    ALTER TABLE public.payments DROP CONSTRAINT payments_method_check;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'payments_method_valid'
      AND conrelid = 'public.payments'::regclass
  ) THEN
    ALTER TABLE public.payments
      ADD CONSTRAINT payments_method_valid
      CHECK (method IN ('cash', 'bank_transfer', 'card', 'cheque', 'other', 'ecod'));
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- audit_logs
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name text NOT NULL,
  record_id text,
  action text NOT NULL CHECK (action IN ('insert', 'update', 'delete')),
  old_data jsonb,
  new_data jsonb,
  performed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  performed_at timestamptz NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- rate_limits  (shared bucket store for per-user / per-IP rate limits)
-- ─────────────────────────────────────────────────────────────────────────────
-- Backs the per-user rate limits in lib/rate-limit.ts (signin, password
-- reset, send-email, geocode, public invoice view, team-management).
-- Without a shared store, an in-memory rate limiter is per-instance on
-- serverless and trivially bypassable across cold starts.
--
-- A row per (key, window_start) bucket. The public.check_rate_limit()
-- function atomically increments the counter and returns the new value;
-- the caller compares it to the per-bucket max. Old buckets are GC'd
-- lazily inside the same function call when the table grows past 10k rows.
CREATE TABLE IF NOT EXISTS public.rate_limits (
  key text NOT NULL,
  window_start timestamptz NOT NULL,
  count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (key, window_start)
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_window_start
  ON public.rate_limits(window_start);

-- Cap key length to defend against attackers flooding the table with
-- junk keys. 200 chars is more than enough for "sendemail:user-uuid"
-- style keys.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'rate_limits_key_length'
  ) THEN
    ALTER TABLE public.rate_limits
      ADD CONSTRAINT rate_limits_key_length
      CHECK (char_length(key) BETWEEN 1 AND 200);
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- public_share_views  (best-effort audit trail for the public share link)
-- ─────────────────────────────────────────────────────────────────────────────
-- Every time a visitor successfully resolves a share_token, the public
-- page inserts a row here. The table is INSERT-only from the service-role
-- client (RLS is enabled and no policy grants INSERT to authenticated);
-- admin profiles can SELECT to spot leaked links.
--
-- ip_address + user_agent are captured so an admin can detect a leaked
-- link in flight (e.g. "this token was viewed from 14 countries in 2
-- hours") and correlate with their edge-proxy logs.
CREATE TABLE IF NOT EXISTS public.public_share_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  share_token uuid NOT NULL,
  ip_address inet,
  user_agent text,
  viewed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_public_share_views_invoice_id
  ON public.public_share_views(invoice_id);
CREATE INDEX IF NOT EXISTS idx_public_share_views_share_token
  ON public.public_share_views(share_token);
CREATE INDEX IF NOT EXISTS idx_public_share_views_viewed_at
  ON public.public_share_views(viewed_at);

-- =============================================================================
-- 2. SAFETY NETS — columns that were added in later migrations. On a fresh
--    DB the CREATE TABLE above already has them; on a drifted live DB these
--    ADD COLUMN IF NOT EXISTS statements converge to the same shape.
-- =============================================================================

-- profiles.account_number (from 015)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS account_number text;

-- clients.account_number (from 054)
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS account_number text;

-- invoices.your_reference (from 054)
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS your_reference text;

-- company_settings.* (from 010 / 012 / 013)
ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS invoice_prefix text NOT NULL DEFAULT 'INV',
  ADD COLUMN IF NOT EXISTS quotation_prefix text NOT NULL DEFAULT 'QTE',
  ADD COLUMN IF NOT EXISTS email_from_name text,
  ADD COLUMN IF NOT EXISTS email_reply_to text;

-- document_sequences.month (from 016) — also backfill and tighten NOT NULL.
ALTER TABLE public.document_sequences
  ADD COLUMN IF NOT EXISTS month smallint;
UPDATE public.document_sequences SET month = 1 WHERE month IS NULL;
ALTER TABLE public.document_sequences
  ALTER COLUMN month SET NOT NULL;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'document_sequences_month_check'
  ) THEN
    ALTER TABLE public.document_sequences
      ADD CONSTRAINT document_sequences_month_check CHECK (month BETWEEN 1 AND 12);
  END IF;
END $$;

-- invoices.* (from 007 / 013 / 014 / 017 / 071)
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS delivery_address_line_1 text,
  ADD COLUMN IF NOT EXISTS delivery_address_line_2 text,
  ADD COLUMN IF NOT EXISTS delivery_town text,
  ADD COLUMN IF NOT EXISTS delivery_county text,
  ADD COLUMN IF NOT EXISTS delivery_postcode text,
  ADD COLUMN IF NOT EXISTS issue_time time,
  ADD COLUMN IF NOT EXISTS share_token uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS public_share_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS share_token_expires_at timestamptz;

-- delivery_method (from 071)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'invoices' AND column_name = 'delivery_method'
  ) THEN
    ALTER TABLE public.invoices
      ADD COLUMN delivery_method text NOT NULL DEFAULT 'delivery'
      CONSTRAINT invoices_delivery_method_check CHECK (delivery_method IN ('delivery', 'collection'));
  END IF;
END $$;

-- document_number_suffix (from 017) — drop the old column (from 008) and
-- recreate it with the new monthly regex. On a fresh DB the CREATE TABLE
-- above already has the new column.
ALTER TABLE public.invoices DROP COLUMN IF EXISTS document_number_suffix;
ALTER TABLE public.invoices
  ADD COLUMN document_number_suffix integer
  GENERATED ALWAYS AS (
    CASE
      WHEN document_number ~ '^[A-Z]+-[0-9]+-[A-L][0-9]+$'
      THEN CAST(substring(split_part(document_number, '-', 3) FROM 2) AS integer)
      ELSE NULL
    END
  ) STORED;


-- =============================================================================
-- 3. INDEXES
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_clients_created_by ON public.clients(created_by);
CREATE INDEX IF NOT EXISTS idx_clients_company_name ON public.clients(company_name);

CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice_id ON public.invoice_items(invoice_id);

CREATE INDEX IF NOT EXISTS idx_payments_invoice_id ON public.payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payments_payment_date ON public.payments(payment_date);

CREATE INDEX IF NOT EXISTS idx_invoices_client_id ON public.invoices(client_id);
CREATE INDEX IF NOT EXISTS idx_invoices_created_by ON public.invoices(created_by);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON public.invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_issue_date ON public.invoices(issue_date);
CREATE INDEX IF NOT EXISTS idx_invoices_document_number ON public.invoices(document_number);  -- from 008
CREATE INDEX IF NOT EXISTS idx_invoices_order_number ON public.invoices(order_number);          -- from 008
CREATE INDEX IF NOT EXISTS idx_invoices_document_number_suffix                                -- from 017
  ON public.invoices(document_number_suffix);
CREATE INDEX IF NOT EXISTS idx_invoices_share_token                                           -- from 013
  ON public.invoices(share_token)
  WHERE public_share_enabled = true;

-- Partial unique index on profiles.account_number (from 015).
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_account_number_unique
  ON public.profiles(account_number)
  WHERE account_number IS NOT NULL;

-- Partial unique index on clients.account_number (from 054).
CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_account_number_unique
  ON public.clients(account_number)
  WHERE account_number IS NOT NULL;

-- =============================================================================
-- 4. FUNCTIONS
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- generate_document_number(doc_prefix text)
-- Final version from 016: per-month sequence, format
--   <PREFIX>-<YEAR>-<MONTH_LETTER><SEQ>   e.g. INV-2026-A1
-- Concurrency safety: a single UPDATE ... RETURNING row-locks the
-- (prefix, year, month) sequence row, so two parallel calls cannot receive
-- the same number and cannot create gaps within a month. SECURITY DEFINER
-- lets it run regardless of the caller's RLS role; document_sequences has no
-- public RLS policy so it is not otherwise reachable.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.generate_document_number(doc_prefix text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year   integer := extract(year  FROM now())::int;
  v_month  integer := extract(month FROM now())::int;
  v_letter text    := chr(64 + v_month);  -- 1 -> 'A', 2 -> 'B', ... 12 -> 'L'
  v_seq    integer;
BEGIN
  -- Ensure a sequence row exists for this prefix + year + month.
  INSERT INTO public.document_sequences (prefix, year, month, current_number)
  VALUES (doc_prefix, v_year, v_month, 0)
  ON CONFLICT (prefix, year, month) DO NOTHING;

  -- Atomically increment and read back the new per-month sequence value.
  UPDATE public.document_sequences
     SET current_number = current_number + 1
   WHERE prefix = doc_prefix
     AND year    = v_year
     AND month   = v_month
  RETURNING current_number INTO v_seq;

  RETURN doc_prefix || '-' || v_year || '-' || v_letter || v_seq;
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_document_number(text) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- generate_unique_account_number()
-- Returns a 7-digit account number that is not already in use on profiles.
-- Retries on collision. Bails after 50 attempts so a pathological collision
-- burst surfaces as a real error rather than a silent hang.
-- (from 015)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.generate_unique_account_number()
RETURNS text
LANGUAGE plpgsql
VOLATILE
AS $$
DECLARE
  v_attempts integer := 0;
  v_candidate text;
  v_exists boolean;
BEGIN
  LOOP
    v_attempts := v_attempts + 1;
    -- 1000000..9999999, zero-padded to 7 digits.
    v_candidate := lpad((floor(random() * 9000000) + 1000000)::text, 7, '0');

    SELECT EXISTS (
      SELECT 1 FROM public.profiles WHERE account_number = v_candidate
    ) INTO v_exists;

    EXIT WHEN NOT v_exists;

    IF v_attempts >= 50 THEN
      RAISE EXCEPTION 'Could not allocate a unique account number after 50 attempts';
    END IF;
  END LOOP;

  RETURN v_candidate;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- generate_unique_client_account_number()
-- Returns a 7-digit account number that is not already in use on clients.
-- Retries on collision. Bails after 50 attempts.
-- (from 054)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.generate_unique_client_account_number()
RETURNS text
LANGUAGE plpgsql
VOLATILE
AS $$
DECLARE
  v_attempts integer := 0;
  v_candidate text;
  v_exists boolean;
BEGIN
  LOOP
    v_attempts := v_attempts + 1;
    -- 1000000..9999999, zero-padded to 7 digits.
    v_candidate := lpad((floor(random() * 9000000) + 1000000)::text, 7, '0');

    SELECT EXISTS (
      SELECT 1 FROM public.clients WHERE account_number = v_candidate
    ) INTO v_exists;

    EXIT WHEN NOT v_exists;

    IF v_attempts >= 50 THEN
      RAISE EXCEPTION 'Could not allocate a unique client account number after 50 attempts';
    END IF;
  END LOOP;

  RETURN v_candidate;
END;
$$;

-- =============================================================================
-- 4a. BACKFILLS (from 054) — these only touch rows on a fresh DB where the
--     data was created before this migration existed.
-- =============================================================================

-- Backfill existing clients that do not yet have an account number.
DO $$
DECLARE
  v_client RECORD;
BEGIN
  FOR v_client IN
    SELECT id FROM public.clients WHERE account_number IS NULL
  LOOP
    UPDATE public.clients
       SET account_number = public.generate_unique_client_account_number()
     WHERE id = v_client.id;
  END LOOP;
END;
$$;

-- Backfill existing invoices so their account_number matches the linked client.
UPDATE public.invoices i
   SET account_number = c.account_number
  FROM public.clients c
 WHERE i.client_id = c.id
   AND (i.account_number IS DISTINCT FROM c.account_number);

-- Backfill your_reference for existing invoices.
UPDATE public.invoices
   SET your_reference = order_number
 WHERE your_reference IS NULL
   AND order_number IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- is_admin() — helper used by RLS policies and the app to test admin role.
-- (from 004)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
     WHERE id = auth.uid() AND role = 'admin'
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- has_staff_permission() — helper used by RLS policies to test a staff
-- capability flag stored in profiles.permissions. Admins always pass; staff
-- pass only when the requested flag is explicitly true.
-- ─────────────────────────────────────────────────────────────────────────────
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

-- ─────────────────────────────────────────────────────────────────────────────
-- handle_new_user()
-- Runs on auth.users insert. Creates the profile row. New users default
-- to 'staff', but an admin invitation can pass invited_role in user
-- metadata ('staff' or 'admin') to set the role at creation time.
-- The first user is NOT auto-promoted to admin any more (see 020).
--
-- The bootstrap path for the first admin is the in-app team management
-- UI (lib/actions/team.ts), which calls the SECURITY DEFINER helpers
-- public.promote_to_admin() / public.demote_from_admin() below. The
-- profiles_guard_last_admin trigger refuses to demote the last admin
-- regardless of which path is used. The earlier standalone SQL scripts
-- (scripts/bootstrap-first-admin.sql, scripts/promote-admin.sql,
-- scripts/demote-admin.sql, scripts/setup-user-as-admin.sql) were
-- retired when the in-app flow landed and are no longer shipped.
-- ─────────────────────────────────────────────────────────────────────────────
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
  -- Default to 'staff'. If the admin invited this user with a specific
  -- role (via inviteStaffUser), honour it, but only allow known roles.
  v_role := COALESCE(NEW.raw_user_meta_data->>'invited_role', 'staff');
  IF v_role NOT IN ('admin', 'staff', 'client', 'picker', 'driver') THEN
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

-- ─────────────────────────────────────────────────────────────────────────────
-- promote_to_admin() / demote_from_admin()
-- SECURITY DEFINER helpers used by the bootstrap + admin-management SQL
-- scripts. Grant-restricted to the service role so they're only callable
-- from psql / the Supabase SQL editor — not from an arbitrary client.
--
-- The companion profiles_guard_last_admin trigger below enforces the
-- "don't lock yourself out" check for ALL update paths (including the
-- in-app demoteFromAdmin server action, which goes through RLS, not
-- these helpers).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.promote_to_admin(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_role text;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'p_user_id is required';
  END IF;

  SELECT role INTO v_current_role FROM public.profiles WHERE id = p_user_id;
  IF v_current_role IS NULL THEN
    RAISE EXCEPTION 'No profile found for user %', p_user_id
      USING ERRCODE = 'P0002';
  END IF;

  IF v_current_role = 'admin' THEN
    RETURN;  -- already admin, no-op
  END IF;

  UPDATE public.profiles SET role = 'admin' WHERE id = p_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.demote_from_admin(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_count int;
  v_current_role text;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'p_user_id is required';
  END IF;

  SELECT role INTO v_current_role FROM public.profiles WHERE id = p_user_id;
  IF v_current_role IS NULL THEN
    RAISE EXCEPTION 'No profile found for user %', p_user_id
      USING ERRCODE = 'P0002';
  END IF;
  IF v_current_role <> 'admin' THEN
    RETURN;  -- already not admin, no-op
  END IF;

  -- Refuse to demote the last admin. The profiles_guard_last_admin
  -- trigger below also enforces this for non-helper update paths.
  SELECT count(*) INTO v_admin_count FROM public.profiles WHERE role = 'admin';
  IF v_admin_count <= 1 THEN
    RAISE EXCEPTION 'Refusing to demote the last admin. Promote a replacement first.'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.profiles SET role = 'staff' WHERE id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.promote_to_admin(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.demote_from_admin(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.promote_to_admin(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.demote_from_admin(uuid) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- claim_first_admin() — in-app first-admin bootstrap.
--
-- Advisory-locked RPC that promotes the given user to admin if and only if
-- the database currently has zero admins. Returns true on promotion, false
-- if an admin already exists (sealed forever). Service-role only so it can
-- bypass the "only admins may change role" trigger during the one-time
-- bootstrap window.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.claim_first_admin(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Serialize concurrent bootstrap attempts. The advisory transaction lock
  -- auto-releases at COMMIT, so the EXISTS check below is race-free.
  PERFORM pg_advisory_xact_lock(hashtext('swbm:bootstrap'));

  -- Sealed forever: once any admin exists this is a no-op.
  IF EXISTS (SELECT 1 FROM public.profiles WHERE role = 'admin') THEN
    RETURN false;
  END IF;

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'User id is required.' USING ERRCODE = 'P0001';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'User profile not found.' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.profiles
     SET role = 'admin'
   WHERE id = p_user_id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_first_admin(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_first_admin(uuid) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- check_rate_limit() — shared, cross-instance rate-limit counter.
-- Backs lib/rate-limit.ts. SECURITY DEFINER so anon + authenticated
-- callers can use the same function regardless of their own grants
-- on the rate_limits table. The table itself has RLS enabled with no
-- policies granted to anon / authenticated, so direct SELECT/INSERT/
-- UPDATE is forbidden — the function is the only public surface.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_key text,
  p_max integer,
  p_window_seconds integer
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_window_start timestamptz;
  v_count integer;
BEGIN
  IF p_key IS NULL OR char_length(p_key) = 0 OR char_length(p_key) > 200 THEN
    RAISE EXCEPTION 'rate_limit key must be 1..200 chars';
  END IF;
  IF p_max IS NULL OR p_max <= 0 OR p_max > 100000 THEN
    RAISE EXCEPTION 'rate_limit max must be 1..100000';
  END IF;
  IF p_window_seconds IS NULL OR p_window_seconds < 1 OR p_window_seconds > 86400 THEN
    RAISE EXCEPTION 'rate_limit window must be 1..86400 seconds';
  END IF;

  v_window_start := to_timestamp(
    floor(extract(epoch FROM now()) / p_window_seconds) * p_window_seconds
  );

  INSERT INTO public.rate_limits (key, window_start, count, updated_at)
  VALUES (p_key, v_window_start, 1, now())
  ON CONFLICT (key, window_start)
  DO UPDATE SET count = public.rate_limits.count + 1, updated_at = now()
  RETURNING count INTO v_count;

  -- Lazy GC: if the table is bigger than 10k rows, drop the oldest
  -- window. Done in the same transaction to keep the table small.
  IF (SELECT count(*) FROM public.rate_limits) > 10000 THEN
    DELETE FROM public.rate_limits
     WHERE window_start < (now() - interval '1 day');
  END IF;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, integer, integer) TO anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- write_audit_log() — trigger helper for AFTER INSERT/UPDATE/DELETE
-- audit logging. SECURITY DEFINER so the trigger can insert into
-- audit_logs even when the calling user has no INSERT grant (the
-- audit row is written as performed_by = auth.uid() or session_user).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.write_audit_log() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_performed_by uuid := auth.uid();
  v_action text;
  v_table text := TG_TABLE_NAME;
  v_record_id text;
  v_old jsonb;
  v_new jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := 'insert';
    v_new := to_jsonb(NEW);
    v_record_id := COALESCE(NEW.id::text, NULL);
  ELSIF TG_OP = 'UPDATE' THEN
    v_action := 'update';
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
    v_record_id := COALESCE(NEW.id::text, OLD.id::text, NULL);
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'delete';
    v_old := to_jsonb(OLD);
    v_record_id := COALESCE(OLD.id::text, NULL);
  END IF;

  INSERT INTO public.audit_logs (table_name, record_id, action, old_data, new_data, performed_by)
  VALUES (v_table, v_record_id, v_action, v_old, v_new, v_performed_by);

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- recompute_invoice_paid()
-- Keeps invoices.amount_paid, invoices.balance_due (generated) and
-- invoices.status in sync with the payments table.
-- This is what makes lib/actions/payments.ts work: the server action only
-- INSERTs/DELETEs a payment row; this trigger recomputes the parent invoice.
-- Combined with the invoices_amount_paid_sane CHECK constraint
-- (amount_paid <= total) added in section 1, this also closes the
-- concurrent-overpayment race: if two payments arrive at once and their sum
-- would exceed the total, the recomputing UPDATE violates the CHECK and the
-- whole payment INSERT statement is rolled back, surfacing a clean error to
-- the caller. (from 003)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.recompute_invoice_paid()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice_id uuid := COALESCE(NEW.invoice_id, OLD.invoice_id);
  v_paid numeric;
  v_total numeric;
  v_current_status text;
  v_new_status text;
BEGIN
  IF v_invoice_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(SUM(amount), 0)
    INTO v_paid
    FROM public.payments
   WHERE invoice_id = v_invoice_id;

  SELECT total, status
    INTO v_total, v_current_status
    FROM public.invoices
   WHERE id = v_invoice_id;

  v_new_status := CASE
    WHEN v_total IS NULL THEN v_current_status
    WHEN v_total > 0 AND v_paid >= v_total THEN 'paid'
    WHEN v_paid > 0 THEN 'partial'
    WHEN v_current_status = 'draft' THEN 'draft'
    ELSE 'sent'
  END;

  -- (CHECK(amount_paid <= total) backstops any concurrent overpayment
  -- attempt by failing this UPDATE.)
  -- A paid invoice means the goods have gone out: mark the order delivered
  -- unless it was already delivered (migration 130).
  UPDATE public.invoices
     SET amount_paid = v_paid,
         status = v_new_status,
         picking_status = CASE
           WHEN v_new_status = 'paid'
                AND picking_status IS DISTINCT FROM 'delivered'
             THEN 'delivered'
           ELSE picking_status
         END,
         picking_delivered_at = CASE
           WHEN v_new_status = 'paid'
                AND picking_status IS DISTINCT FROM 'delivered'
             THEN now()
           ELSE picking_delivered_at
         END,
         updated_at = now()
   WHERE id = v_invoice_id;

  RETURN NULL;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- touch_updated_at()
-- Generic BEFORE UPDATE trigger function that stamps updated_at = now().
-- (from 003)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- update_invoice_with_items(p_invoice_id, p_user_id, p_payload)
-- Single SECURITY DEFINER transactional function that updates the invoice
-- row AND replaces its line items. Previously the action did
-- UPDATE → INSERT new items → DELETE old items as three independent
-- Supabase calls; a failure mid-sequence could leave every line item
-- doubled or the metadata changed while items stayed old.
--
-- p_payload is a JSON object with the new invoice fields plus an `items`
-- array. Each item has: product_id, product_name, product_code, unit,
-- quantity, price, vat_rate, vat_amount, line_total. Validation (status
-- transitions, total >= amount_paid, etc.) is performed by the caller
-- before invoking this function — it only handles the atomic write.
--
-- issue_time handling (from 014): the key is treated as a present/absent
-- marker. If the key is present (even as an empty string), it sets the
-- column to NULL/empty; if the key is absent, it preserves the existing
-- value. The UI always sends the key, so this gives the expected
-- "save what the user typed" behaviour.
--
-- SECURITY: p_user_id is kept in the signature for backward-compat with
-- the action caller, but the authz check uses auth.uid() (the session
-- user) directly. This means even if a future caller passes someone
-- else's id, they can only act on their own invoices (or be admin).
-- (base from 011, issue_time from 014, authz switch from 019)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_invoice_with_items(
  p_invoice_id uuid,
  p_user_id uuid,
  p_payload jsonb
) RETURNS public.invoices
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing public.invoices;
  v_is_admin boolean;
  v_item jsonb;
  v_sort integer := 0;
BEGIN
  -- Lock the row to prevent concurrent edits.
  SELECT * INTO v_existing FROM public.invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice not found' USING ERRCODE = 'P0002';
  END IF;

  -- Authorization: caller must be the owner or an admin. SECURITY
  -- DEFINER preserves auth.uid() so is_admin() resolves against the
  -- session user, not the function owner. We deliberately check
  -- auth.uid() instead of trusting p_user_id, so even a misbehaving
  -- caller passing someone else's id is still gated correctly.
  SELECT public.is_admin() INTO v_is_admin;
  IF v_existing.created_by <> auth.uid() AND NOT v_is_admin THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  -- Update invoice metadata. NULLIF keeps empty strings from clobbering
  -- existing values when the field was omitted. Keys that are absent from the
  -- payload preserve the existing column value; keys that are present (even as
  -- empty strings) update it. This matches the caller's documented contract and
  -- prevents silently wiping order_number / account_number on every edit.
  UPDATE public.invoices SET
    client_id              = COALESCE(NULLIF(p_payload->>'client_id', '')::uuid, client_id),
    type                   = COALESCE(NULLIF(p_payload->>'type', ''), type),
    document_number        = CASE
                              WHEN p_payload ? 'document_number'
                                THEN NULLIF(p_payload->>'document_number', '')
                              ELSE document_number
                            END,
    issue_date             = COALESCE(NULLIF(p_payload->>'issue_date', '')::date, issue_date),
    issue_time             = CASE
                              WHEN p_payload ? 'issue_time' THEN NULLIF(p_payload->>'issue_time', '')::time
                              ELSE issue_time
                            END,
    due_date               = NULLIF(p_payload->>'due_date', '')::date,
    expiry_date            = NULLIF(p_payload->>'expiry_date', '')::date,
    order_number           = CASE
                              WHEN p_payload ? 'order_number'
                                THEN NULLIF(p_payload->>'order_number', '')
                              ELSE order_number
                            END,
    account_number         = CASE
                              WHEN p_payload ? 'account_number'
                                THEN NULLIF(p_payload->>'account_number', '')
                              ELSE account_number
                            END,
    operator_name          = COALESCE(NULLIF(p_payload->>'operator_name', ''), operator_name),
    your_reference         = NULLIF(p_payload->>'your_reference', ''),
    notes                  = NULLIF(p_payload->>'notes', ''),
show_payment_terms     = CASE
                               WHEN p_payload ? 'show_payment_terms'
                                 THEN COALESCE(NULLIF(p_payload->>'show_payment_terms', '')::boolean, show_payment_terms)
                               ELSE show_payment_terms
                             END,
    show_watermark         = CASE
                               WHEN p_payload ? 'show_watermark'
                                 THEN COALESCE(NULLIF(p_payload->>'show_watermark', '')::boolean, show_watermark)
                               ELSE show_watermark
                             END,
    show_paid_watermark    = CASE
                               WHEN p_payload ? 'show_paid_watermark'
                                 THEN COALESCE(NULLIF(p_payload->>'show_paid_watermark', '')::boolean, show_paid_watermark)
                               ELSE show_paid_watermark
                             END,
    show_partially_paid_watermark = CASE
                               WHEN p_payload ? 'show_partially_paid_watermark'
                                 THEN COALESCE(NULLIF(p_payload->>'show_partially_paid_watermark', '')::boolean, show_partially_paid_watermark)
                               ELSE show_partially_paid_watermark
                             END,
    show_overdue_watermark = CASE
                               WHEN p_payload ? 'show_overdue_watermark'
                                 THEN COALESCE(NULLIF(p_payload->>'show_overdue_watermark', '')::boolean, show_overdue_watermark)
                               ELSE show_overdue_watermark
                             END,
    status                 = COALESCE(NULLIF(p_payload->>'status', ''), status),
    delivery_method        = COALESCE(NULLIF(p_payload->>'delivery_method', ''), delivery_method),
    delivery_address_line_1 = NULLIF(p_payload->>'delivery_address_line_1', ''),
    delivery_address_line_2 = NULLIF(p_payload->>'delivery_address_line_2', ''),
    delivery_town          = NULLIF(p_payload->>'delivery_town', ''),
    delivery_county        = NULLIF(p_payload->>'delivery_county', ''),
    delivery_postcode      = UPPER(NULLIF(p_payload->>'delivery_postcode', '')),
    subtotal               = (p_payload->>'subtotal')::numeric,
    vat_total              = (p_payload->>'vat_total')::numeric,
    total                  = (p_payload->>'total')::numeric,
    updated_at             = now()
  WHERE id = p_invoice_id;

  -- Replace line items atomically. DELETE + INSERT in the same transaction
  -- either both commit or both roll back, so items can never end up doubled
  -- or empty after a partial failure.
  DELETE FROM public.invoice_items WHERE invoice_id = p_invoice_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_payload->'items', '[]'::jsonb))
  LOOP
    INSERT INTO public.invoice_items (
      invoice_id, product_id, product_name, product_code, unit,
      quantity, price, vat_rate, vat_amount, line_total, sort_order
    ) VALUES (
      p_invoice_id,
      NULLIF(v_item->>'product_id', '')::uuid,
      v_item->>'product_name',
      NULLIF(v_item->>'product_code', ''),
      COALESCE(NULLIF(v_item->>'unit', ''), 'EA'),
      (v_item->>'quantity')::numeric,
      (v_item->>'price')::numeric,
      (v_item->>'vat_rate')::numeric,
      (v_item->>'vat_amount')::numeric,
      (v_item->>'line_total')::numeric,
      v_sort
    );
    v_sort := v_sort + 1;
  END LOOP;

  -- Return the updated row. The CHECK(amount_paid <= total) constraint on the
  -- table is enforced here: if the new total is below amount_paid, the
  -- implicit statement aborts and the whole transaction rolls back.
  RETURN (SELECT * FROM public.invoices WHERE id = p_invoice_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_invoice_with_items(uuid, uuid, jsonb) TO authenticated;

-- =============================================================================
-- 5. TRIGGERS
-- =============================================================================

-- auth.users → handle_new_user
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- payments → recompute_invoice_paid
DROP TRIGGER IF EXISTS payments_recompute_insert ON public.payments;
CREATE TRIGGER payments_recompute_insert
  AFTER INSERT ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.recompute_invoice_paid();

DROP TRIGGER IF EXISTS payments_recompute_update ON public.payments;
CREATE TRIGGER payments_recompute_update
  AFTER UPDATE OF invoice_id, amount ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.recompute_invoice_paid();

DROP TRIGGER IF EXISTS payments_recompute_delete ON public.payments;
CREATE TRIGGER payments_recompute_delete
  AFTER DELETE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.recompute_invoice_paid();

-- updated_at touch triggers
DROP TRIGGER IF EXISTS invoices_touch_updated_at ON public.invoices;
CREATE TRIGGER invoices_touch_updated_at
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS clients_touch_updated_at ON public.clients;
CREATE TRIGGER clients_touch_updated_at
  BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS products_touch_updated_at ON public.products;
CREATE TRIGGER products_touch_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- audit triggers (from 019) — wire write_audit_log() to every table we
-- care about. The function is SECURITY DEFINER so the trigger can insert
-- into audit_logs even when the calling user has no INSERT grant.
-- ─────────────────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS audit_invoices ON public.invoices;
CREATE TRIGGER audit_invoices
  AFTER INSERT OR UPDATE OR DELETE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();

DROP TRIGGER IF EXISTS audit_payments ON public.payments;
CREATE TRIGGER audit_payments
  AFTER INSERT OR UPDATE OR DELETE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();

DROP TRIGGER IF EXISTS audit_profiles ON public.profiles;
CREATE TRIGGER audit_profiles
  AFTER INSERT OR UPDATE OR DELETE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();

DROP TRIGGER IF EXISTS audit_company_settings ON public.company_settings;
CREATE TRIGGER audit_company_settings
  AFTER INSERT OR UPDATE OR DELETE ON public.company_settings
  FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();

DROP TRIGGER IF EXISTS audit_company_bank_details ON public.company_bank_details;
CREATE TRIGGER audit_company_bank_details
  AFTER INSERT OR UPDATE OR DELETE ON public.company_bank_details
  FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();

-- ─────────────────────────────────────────────────────────────────────────────
-- freeze_invoice_ownership (from 019) — refuses to let a non-admin
-- change created_by on invoices. The RLS WITH CHECK clause on
-- invoices_update allows `created_by = auth.uid()` to be written by
-- the row's owner, which a malicious user could use to "move" an
-- invoice to themselves; this trigger is the real enforcement.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.freeze_invoice_ownership() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    IF NOT public.is_admin() THEN
      RAISE EXCEPTION 'Cannot change created_by on an invoice (admin only)'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS invoices_freeze_ownership ON public.invoices;
CREATE TRIGGER invoices_freeze_ownership
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.freeze_invoice_ownership();

-- ─────────────────────────────────────────────────────────────────────────────
-- company_settings / company_bank_details: pin updated_by (from 019)
-- A non-admin cannot write a foreign updated_by value; admins keep
-- the right to set it (e.g. for a backfill script).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.pin_company_settings_updated_by() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    NEW.updated_by := auth.uid();
  END IF;
  IF NEW.updated_by IS NULL THEN
    NEW.updated_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS company_settings_pin_updated_by ON public.company_settings;
CREATE TRIGGER company_settings_pin_updated_by
  BEFORE INSERT OR UPDATE ON public.company_settings
  FOR EACH ROW EXECUTE FUNCTION public.pin_company_settings_updated_by();

CREATE OR REPLACE FUNCTION public.pin_company_bank_updated_by() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    NEW.updated_by := auth.uid();
  END IF;
  IF NEW.updated_by IS NULL THEN
    NEW.updated_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS company_bank_pin_updated_by ON public.company_bank_details;
CREATE TRIGGER company_bank_pin_updated_by
  BEFORE INSERT OR UPDATE ON public.company_bank_details
  FOR EACH ROW EXECUTE FUNCTION public.pin_company_bank_updated_by();

-- ─────────────────────────────────────────────────────────────────────────────
-- profiles_guard_last_admin (from 020) — refuses to demote the last
-- admin regardless of who does the update. The demote_from_admin()
-- helper has the same check inline (so SQL scripts fail closed), and
-- the in-app demoteFromAdmin server action goes through this trigger
-- on its RLS-mediated UPDATE.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.guard_last_admin() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_admin_count int;
BEGIN
  -- Only care about demotions: NEW.role = 'staff' AND OLD.role = 'admin'.
  IF NOT (NEW.role = 'staff' AND OLD.role = 'admin') THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO v_admin_count
    FROM public.profiles
   WHERE role = 'admin' AND id <> OLD.id;

  IF v_admin_count = 0 THEN
    RAISE EXCEPTION 'Refusing to demote the last admin. Promote a replacement first.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_guard_last_admin ON public.profiles;
CREATE TRIGGER profiles_guard_last_admin
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_last_admin();

-- =============================================================================
-- 6. ROW LEVEL SECURITY
-- =============================================================================
-- An authenticated user may fully manage rows they own (created_by = auth.uid()),
-- and admins (is_admin()) may access everything. company_settings /
-- company_bank_details are read-all-authenticated / write-admin-only. products
-- is read-all-authenticated / write-admin-only. audit_logs is admin-only.
-- document_sequences has no direct RLS policy: it is only mutated through the
-- SECURITY DEFINER generate_document_number() function.
-- profiles: SELECT is restricted to "self or admin" (profiles_select_self_or_admin).
-- rate_limits: RLS enabled with no policies; only the SECURITY DEFINER
-- check_rate_limit() function can read or write.

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_bank_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.public_share_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_sequences ENABLE ROW LEVEL SECURITY;
-- rate_limits: enabled with NO policies granted to anon / authenticated.
-- The only public surface is the SECURITY DEFINER check_rate_limit() RPC,
-- which is the right place for that logic. Direct table access is denied
-- so an attacker can't read / wipe / rewrite another tenant's buckets.
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_products ENABLE ROW LEVEL SECURITY;

-- profiles
-- A user can always see their own profile row. Admins can see everyone,
-- and staff with the settings_manage_team permission can see and update
-- other staff/admin rows so they can promote/demote team members. The
-- dashboard pages gate on is_admin() / has_staff_permission() before
-- reading other users' profiles — the policy is the second layer of defence.
DROP POLICY IF EXISTS profiles_select_authenticated ON public.profiles;
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

-- 025/045: enforce that clients and staff can only edit non-sensitive columns.
-- Sensitive changes (client_id, is_active, email, permissions, account_number)
-- require an admin or the service-role key. Role changes are also permitted for
-- staff who have the settings_manage_team permission, but only between the
-- 'admin' and 'staff' roles.
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

  -- Role changes are admin-only. Allowing team managers (settings_manage_team)
  -- to transition roles between admin and staff created a privilege-escalation
  -- path where a staff user could promote themselves to admin by calling the
  -- Supabase client directly and bypassing the application layer.
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    IF NOT public.is_admin() THEN
      RAISE EXCEPTION 'Only administrators can change role.'
        USING ERRCODE = '42501';
    END IF;
    IF NEW.role NOT IN ('admin', 'staff', 'client') OR OLD.role NOT IN ('admin', 'staff', 'client') THEN
      RAISE EXCEPTION 'Invalid role transition.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Permissions and account_number are privileged fields that drive RBAC and
  -- cross-row access. Only administrators (or service_role, handled above) may
  -- change them on any row, including the caller's own row. Allowing a staff
  -- user to edit their own permissions created a privilege-escalation path.
  IF NEW.permissions IS DISTINCT FROM OLD.permissions
     OR NEW.account_number IS DISTINCT FROM OLD.account_number THEN
    IF NOT public.is_admin() THEN
      RAISE EXCEPTION 'Only administrators can change permissions or account number.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Email changes on another user's row are admin-only. A user may still change
  -- their own email address; the application layer should verify the address.
  IF NEW.email IS DISTINCT FROM OLD.email AND OLD.id <> auth.uid() THEN
    IF NOT public.is_admin() THEN
      RAISE EXCEPTION 'Only administrators can change another user''s email.'
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

DROP POLICY IF EXISTS profiles_delete_admin ON public.profiles;
CREATE POLICY profiles_delete_admin ON public.profiles
  FOR DELETE TO authenticated USING (public.is_admin());

-- company_settings (read all authenticated, write admin or settings_edit_company)
DROP POLICY IF EXISTS company_settings_select ON public.company_settings;
CREATE POLICY company_settings_select ON public.company_settings
  FOR SELECT TO authenticated USING (true);

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

-- company_bank_details (operators only; public PDF uses service role)
DROP POLICY IF EXISTS company_bank_select ON public.company_bank_details;
CREATE POLICY company_bank_select ON public.company_bank_details
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'staff')
    )
  );
DROP POLICY IF EXISTS company_bank_update ON public.company_bank_details;
CREATE POLICY company_bank_update ON public.company_bank_details
  FOR UPDATE TO authenticated
  USING (
    public.is_admin() OR public.has_staff_permission('settings_edit_company')
  )
  WITH CHECK (
    public.is_admin() OR public.has_staff_permission('settings_edit_company')
  );

-- INSERT policy is required for upsert() when the single bank-details row
-- doesn't exist yet (first save on a fresh install). Without this the
-- upsert returns 42501 and the settings save fails.
DROP POLICY IF EXISTS company_bank_insert ON public.company_bank_details;
CREATE POLICY company_bank_insert ON public.company_bank_details
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin() OR public.has_staff_permission('settings_edit_company')
  );

-- company_phones / company_emails (read all authenticated, write admin or settings_edit_company)
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

-- clients (owner or admin)
DROP POLICY IF EXISTS clients_select ON public.clients;
CREATE POLICY clients_select ON public.clients
  FOR SELECT TO authenticated USING (created_by = auth.uid() OR public.is_admin());
DROP POLICY IF EXISTS clients_insert ON public.clients;
CREATE POLICY clients_insert ON public.clients
  FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid() OR public.is_admin());
DROP POLICY IF EXISTS clients_update ON public.clients;
CREATE POLICY clients_update ON public.clients
  FOR UPDATE TO authenticated USING (created_by = auth.uid() OR public.is_admin())
  WITH CHECK (created_by = auth.uid() OR public.is_admin());
DROP POLICY IF EXISTS clients_delete ON public.clients;
CREATE POLICY clients_delete ON public.clients
  FOR DELETE TO authenticated USING (created_by = auth.uid() OR public.is_admin());

-- products (public catalogue read for anon; full select for authenticated;
-- write admin only). Drop any split policies from migration 123 so a fresh
-- schema.sql run never leaves conflicting SELECT policies behind.
DROP POLICY IF EXISTS products_select ON public.products;
DROP POLICY IF EXISTS products_select_anon ON public.products;
DROP POLICY IF EXISTS products_select_authenticated ON public.products;
-- Anon: active permanent catalogue only (matches public shop filters).
CREATE POLICY products_select_anon ON public.products
  FOR SELECT
  TO anon
  USING (
    deleted_at IS NULL
    AND is_active = true
    AND COALESCE(is_temporary, false) = false
  );
-- Signed-in staff/clients: full row set (dashboard, soft-deleted, temps).
CREATE POLICY products_select_authenticated ON public.products
  FOR SELECT
  TO authenticated
  USING (true);
DROP POLICY IF EXISTS products_insert ON public.products;
CREATE POLICY products_insert ON public.products
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS products_update ON public.products;
CREATE POLICY products_update ON public.products
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS products_delete ON public.products;
CREATE POLICY products_delete ON public.products
  FOR DELETE TO authenticated USING (public.is_admin());

-- campaigns (public read, write admin only)
DROP POLICY IF EXISTS campaigns_public_read ON public.campaigns;
CREATE POLICY campaigns_public_read ON public.campaigns
  FOR SELECT TO anon, authenticated
  USING (deleted_at IS NULL);

DROP POLICY IF EXISTS campaigns_admin_insert ON public.campaigns;
CREATE POLICY campaigns_admin_insert ON public.campaigns
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS campaigns_admin_update ON public.campaigns;
CREATE POLICY campaigns_admin_update ON public.campaigns
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS campaigns_admin_delete ON public.campaigns;
CREATE POLICY campaigns_admin_delete ON public.campaigns
  FOR DELETE TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS campaign_products_public_read ON public.campaign_products;
CREATE POLICY campaign_products_public_read ON public.campaign_products
  FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS campaign_products_admin_insert ON public.campaign_products;
CREATE POLICY campaign_products_admin_insert ON public.campaign_products
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS campaign_products_admin_update ON public.campaign_products;
CREATE POLICY campaign_products_admin_update ON public.campaign_products
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS campaign_products_admin_delete ON public.campaign_products;
CREATE POLICY campaign_products_admin_delete ON public.campaign_products
  FOR DELETE TO authenticated
  USING (public.is_admin());

-- invoices (owner or admin)
DROP POLICY IF EXISTS invoices_select ON public.invoices;
CREATE POLICY invoices_select ON public.invoices
  FOR SELECT TO authenticated USING (created_by = auth.uid() OR public.is_admin());
DROP POLICY IF EXISTS invoices_insert ON public.invoices;
CREATE POLICY invoices_insert ON public.invoices
  FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid() OR public.is_admin());
DROP POLICY IF EXISTS invoices_update ON public.invoices;
CREATE POLICY invoices_update ON public.invoices
  FOR UPDATE TO authenticated USING (created_by = auth.uid() OR public.is_admin())
  WITH CHECK (created_by = auth.uid() OR public.is_admin());
DROP POLICY IF EXISTS invoices_delete ON public.invoices;
CREATE POLICY invoices_delete ON public.invoices
  FOR DELETE TO authenticated USING (created_by = auth.uid() OR public.is_admin());

-- invoice_items / payments (access follows the owning invoice)
DROP POLICY IF EXISTS invoice_items_select ON public.invoice_items;
CREATE POLICY invoice_items_select ON public.invoice_items
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.invoices
             WHERE id = invoice_items.invoice_id
               AND (created_by = auth.uid() OR public.is_admin()))
  );
DROP POLICY IF EXISTS invoice_items_insert ON public.invoice_items;
CREATE POLICY invoice_items_insert ON public.invoice_items
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.invoices
             WHERE id = invoice_items.invoice_id
               AND (created_by = auth.uid() OR public.is_admin()))
  );
DROP POLICY IF EXISTS invoice_items_update ON public.invoice_items;
CREATE POLICY invoice_items_update ON public.invoice_items
  FOR UPDATE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.invoices
             WHERE id = invoice_items.invoice_id
               AND (created_by = auth.uid() OR public.is_admin()))
  );
DROP POLICY IF EXISTS invoice_items_delete ON public.invoice_items;
CREATE POLICY invoice_items_delete ON public.invoice_items
  FOR DELETE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.invoices
             WHERE id = invoice_items.invoice_id
               AND (created_by = auth.uid() OR public.is_admin()))
  );

DROP POLICY IF EXISTS payments_select ON public.payments;
CREATE POLICY payments_select ON public.payments
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.invoices
             WHERE id = payments.invoice_id
               AND (created_by = auth.uid() OR public.is_admin()))
  );
DROP POLICY IF EXISTS payments_insert ON public.payments;
CREATE POLICY payments_insert ON public.payments
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.invoices
             WHERE id = payments.invoice_id
               AND (created_by = auth.uid() OR public.is_admin()))
  );
DROP POLICY IF EXISTS payments_update ON public.payments;
CREATE POLICY payments_update ON public.payments
  FOR UPDATE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.invoices
             WHERE id = payments.invoice_id
               AND (created_by = auth.uid() OR public.is_admin()))
  );
DROP POLICY IF EXISTS payments_delete ON public.payments;
CREATE POLICY payments_delete ON public.payments
  FOR DELETE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.invoices
             WHERE id = payments.invoice_id
               AND (created_by = auth.uid() OR public.is_admin()))
  );

-- audit_logs (admin only)
DROP POLICY IF EXISTS audit_logs_select ON public.audit_logs;
CREATE POLICY audit_logs_select ON public.audit_logs
  FOR SELECT TO authenticated USING (public.is_admin());
DROP POLICY IF EXISTS audit_logs_insert ON public.audit_logs;
CREATE POLICY audit_logs_insert ON public.audit_logs
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());

-- public_share_views: INSERT happens only via the service-role client
-- (the public page), so no policy is granted to `authenticated` for
-- INSERT — RLS denies it by default. SELECT is admin-only so admins can
-- audit which links have been opened.
DROP POLICY IF EXISTS public_share_views_select ON public.public_share_views;
CREATE POLICY public_share_views_select ON public.public_share_views
  FOR SELECT TO authenticated USING (public.is_admin());

-- NOTE: quote_requests / quote_request_items RLS + GRANTs are applied AFTER
-- those tables are created (migration 022 block later in this file). Referencing
-- them here fails on a fresh database with 42P01.

-- =============================================================================
-- 7. GRANTS (core tables only — shop/portal tables granted after CREATE TABLE)
-- =============================================================================
-- Tables: SELECT/INSERT/UPDATE/DELETE for authenticated on the business
-- tables. RLS policies narrow what each role can do per row.
--
-- service_role also gets SELECT on the read-side tables it needs to render
-- the public share view at /invoice/[token] (createAdminClient() uses the
-- service-role key there). It bypasses RLS but still needs base-table
-- GRANTs; without these it returns 42501 and .maybeSingle() yields null,
-- which the page turns into a 404. INSERT on public_share_views lets the
-- page log each public view.
GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.profiles, public.company_settings, public.company_bank_details,
  public.company_phones, public.company_emails,
  public.clients, public.products, public.invoices, public.invoice_items,
  public.payments TO authenticated;
GRANT SELECT ON
  public.invoices, public.invoice_items, public.clients,
  public.payments,
  public.company_settings, public.company_bank_details,
  public.company_phones, public.company_emails
TO service_role;
GRANT INSERT ON public.public_share_views TO service_role;

-- service_role also needs to read profiles when pre-resolving an auth user by
-- email during invite send/accept. Profiles are updated through the secure
-- accept_invitation RPC, so only SELECT is required directly.
GRANT SELECT ON public.profiles TO service_role;

-- Public quote-request submission re-fetches products via service role.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO service_role;

GRANT SELECT ON public.products TO anon;
GRANT SELECT ON public.audit_logs TO authenticated;
GRANT INSERT ON public.audit_logs TO authenticated;
GRANT SELECT ON public.public_share_views TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- rate_limits: deliberately NO grants to anon or authenticated. RLS is
-- enabled and no policies are granted, so direct access is denied. The
-- only public surface is the SECURITY DEFINER check_rate_limit() RPC,
-- which is GRANT EXECUTE'd to anon + authenticated above. This is the
-- right place for that logic — anonymous and authenticated callers can
-- rate-limit themselves, but they cannot read / wipe / rewrite other
-- tenants' rate-limit buckets.
-- (No GRANT line on purpose.)

-- =============================================================================
-- 8. SEED DATA
-- =============================================================================

-- Single company_settings / company_bank_details rows so settings UI and the
-- invoice PDF template always have data to load. Idempotent.
INSERT INTO public.company_settings (id, company_name)
VALUES (1, 'Demo Builder Merchant')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.company_bank_details (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

-- Starter product catalogue. Categories align with lib/products.ts
-- (COMMON_CATEGORIES). Idempotent via ON CONFLICT (code) DO NOTHING.
INSERT INTO public.products (code, name, unit, category, default_price, is_active) VALUES
  -- Aggregates & Cement
  ('SHRP',     'Building Sand',                 'TON',  'Aggregates & Cement', 85.00,  true),
  ('BAL10',    '10mm All-in Ballast',           'TON',  'Aggregates & Cement', 92.00,  true),
  ('GRA20',    '20mm Gravel',                   'TON',  'Aggregates & Cement', 95.00,  true),
  ('TYPE1',    'MOT Type 1 Sub Base',           'TON',  'Aggregates & Cement', 38.00,  true),
  ('CEM-I',    'Portland Cement 25kg',          'BAG',  'Cement & Additives',  7.50,   true),
  ('CEM-RPD',  'Rapid Set Cement 25kg',         'BAG',  'Cement & Additives',  8.95,   true),
  -- Plasterboard
  ('PB-12-2400','Plasterboard 12.5mm 2400x1200','SHEET','Plasterboard',        14.50,  true),
  ('PB-MR-1800','Moisture Resistant Board 1800', 'SHEET','Plasterboard',       12.75,  true),
  -- Blocks
  ('DENSE-100','100mm Dense Concrete Block',    'EA',   'Blocks',              1.85,   true),
  ('HOLLOW-100','100mm Hollow Block',           'EA',   'Blocks',              1.45,   true),
  ('AIR-100', '100mm Aircrete Block',           'EA',   'Blocks',              2.35,   true),
  -- Bricks
  ('WIRE-FN',  'Wirecut Facing Brick',          'EA',   'Bricks',              0.65,   true),
  ('ENG-CLAS','Engineering Class B Brick',      'EA',   'Bricks',              0.78,   true),
  -- Timber
  ('CLS38-89', 'CLS Timber 38x89mm 2.4m',       'EA',   'Timber',              6.40,   true),
  ('CLP-150', 'Treated Cladding 150mm 4.8m',    'EA',   'Timber',              12.90,  true),
  ('SKIR-MDF','MDF Skirting 119x18mm 4.4m',     'EA',   'Timber',              8.25,   true),
  -- Cavity Insulation
  ('CAV-100', 'Cavity Wall Insulation 100mm',   'SHEET','Cavity Insulation',   18.50,  true),
  ('FULL-50', 'Full Fill Cavity 50mm',          'SHEET','Cavity Insulation',   15.00,  true),
  -- PIR Insulation
  ('PIR-100', 'PIR Insulation Board 100mm',     'SHEET','PIR Insulation',      32.00,  true),
  ('PIR-50',  'PIR Insulation Board 50mm',      'SHEET','PIR Insulation',      21.50,  true),
  -- Sheet Materials
  ('OSB-18',  'OSB Board 18mm 2440x1220',       'SHEET','Sheet Materials',     24.75,  true),
  ('PLY-12',  'Hardwood Plywood 12mm',          'SHEET','Sheet Materials',     36.40,  true),
  ('MDF-18',  'MDF Sheet 18mm 2440x1220',       'SHEET','Sheet Materials',     27.90,  true),
  -- Steel & Lintels
  ('CAT-LIN', 'Catnic Cavity Lintel 1200mm',    'EA',   'Steel & Lintels',     42.00,  true),
  ('IB-LIN',  'IG Lintel 1500mm',               'EA',   'Steel & Lintels',     48.50,  true),
  -- Roofing
  ('CON-ROOF','Concrete Roof Tile',             'EA',   'Roofing',             0.85,   true),
  ('DRY-RDG', 'Dry Ridge Kit',                  'EA',   'Roofing',             95.00,  true),
  ('UND-FELT','Breathable Underlay 50m',        'ROLL', 'Roofing',             78.00,  true),
  -- Drainage
  ('UND-110', 'Underground Pipe 110mm',         'M',    'Drainage',            6.20,   true),
  ('GULLY',   'Bottle Gully',                   'EA',   'Drainage',            14.50,  true),
  ('IC-450',  'Inspection Chamber 450mm',       'EA',   'Drainage',            62.00,  true),
  -- Fixings
  ('SCR-FC',  'Frame Fixing Screws M8x100 x50', 'BOX',  'Fixings',             18.75,  true),
  ('NAIL-50', 'Galvanised Clout Nails 50mm',    'BOX',  'Fixings',             9.40,   true),
  -- Tools
  ('TRL-VEL', 'Trowel 12" London Pattern',      'EA',   'Tools',               22.50,  true),
  ('LEV-1220','Spirit Level 1220mm',            'EA',   'Tools',               48.00,  true),
  ('MAS-PL',  'Pointing Trowel',                'EA',   'Tools',               11.25,  true)
ON CONFLICT (code) DO NOTHING;

-- =============================================================================
-- MIGRATIONS APPLIED AFTER BASELINE (021-026)
-- =============================================================================
-- The following sections append the contents of migrations 021-026 so that a
-- fresh database can reach the current state by running this file alone. Each
-- section uses idempotent DDL (IF NOT EXISTS / CREATE OR REPLACE / DROP IF
-- EXISTS) where possible, so re-running the file is safe.
-- =============================================================================


-- >>>>> BEGIN supabase/migrations/021_client_portal.sql >>>>>
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
      CHECK (role IN ('admin', 'staff', 'client', 'picker'));
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
  last_sent_at timestamptz
);

-- service_role needs full control of client_invitations (server actions via
-- createAdminClient). Placed here so a fresh schema run never GRANTs a
-- missing relation.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_invitations TO service_role;

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
-- <<<<< END supabase/migrations/021_client_portal.sql <<<<<

-- >>>>> BEGIN supabase/migrations/022_shop.sql >>>>>
-- =============================================================================
-- Star Hawk Builders Merchant — 022_shop.sql
-- =============================================================================
-- Adds the public-facing shopping and quote-request flow:
--
--   1. quote_requests
--        - one row per quote request submitted from the public site
--        - carries the contact details, delivery address, status, and the
--          IP / user-agent of the submitter for abuse tracking
--
--   2. quote_request_items
--        - line items attached to a quote request
--        - snapshots product code/name/unit at submission time so the
--          request stays readable even if the catalog changes later
--
--   3. ip_bans
--        - IPs that have been blocked from submitting quote requests
--        - reason + optional expiry so the ban can be lifted later
--
--   4. ip_email_log
--        - audit trail of (ip, email) pairs from quote submissions
--        - used by record_ip_email() to detect multiple emails from one
--          IP (a strong signal of bot / fraud activity)
--
-- All four tables have RLS enabled but NO policies for anon / authenticated.
-- Reads and writes only happen through the service-role client (the public
-- API endpoint inserts on behalf of anonymous visitors) or through the
-- authenticated admin dashboard. This is the same pattern used by
-- client_invitations in 021.
--
-- Idempotency: every CREATE / ADD COLUMN is guarded so re-running against
-- an already-migrated DB is a no-op.
-- =============================================================================


-- =============================================================================
-- 1. quote_requests
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.quote_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Sequential number in the same style as invoices. Prefix depends on
  -- `kind` — 'QR-…' for quote requests, 'OR-…' for orders — so the trade
  -- counter can tell at a glance. Allocated atomically via
  -- public.generate_document_number() at insert time so concurrent
  -- submissions can't collide.
  request_number text NOT NULL UNIQUE,
  client_name text NOT NULL,
  client_email text NOT NULL,
  client_phone text,
  client_company text,
  delivery_address_line_1 text,
  delivery_address_line_2 text,
  delivery_town text,
  delivery_county text,
  delivery_postcode text,
  notes text,
  -- kind chooses the prefix and the operator's first-glance label:
  --   'quote' — customer wanted a written quote (some/all lines may have
  --             been unpriced; operator fills in the missing prices).
  --   'order' — every line had a price the customer accepted; the operator
  --             needs to call, confirm, then convert straight to an invoice
  --             for payment before release.
  -- Both share the same status pipeline below.
  kind text NOT NULL DEFAULT 'quote'
    CHECK (kind IN ('quote', 'order')),
  -- status transitions: pending → reviewed → invoiced (happy path),
  -- or pending → rejected. 'cancelled' is a soft-delete for the
  -- admin's own record-keeping.
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'reviewed', 'invoiced', 'rejected', 'cancelled')),
  ip_address inet NOT NULL,
  user_agent text,
  processed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  processed_at timestamptz,
  -- created_invoice_id is filled when status flips to 'invoiced' so the
  -- admin can jump straight from the request to the invoice it produced.
  created_invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quote_requests_email_created
  ON public.quote_requests (client_email, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_quote_requests_status_created
  ON public.quote_requests (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_quote_requests_ip
  ON public.quote_requests (ip_address);
-- Admin inbox filters by (status, kind). A composite index keeps that
-- query cheap as the table grows.
CREATE INDEX IF NOT EXISTS idx_quote_requests_status_kind_created
  ON public.quote_requests (status, kind, created_at DESC);

ALTER TABLE public.quote_requests ENABLE ROW LEVEL SECURITY;

-- Admin dashboard policies (public submissions still use service-role).
DROP POLICY IF EXISTS quote_requests_select ON public.quote_requests;
CREATE POLICY quote_requests_select ON public.quote_requests
  FOR SELECT TO authenticated USING (public.is_admin());
DROP POLICY IF EXISTS quote_requests_insert ON public.quote_requests;
CREATE POLICY quote_requests_insert ON public.quote_requests
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS quote_requests_update ON public.quote_requests;
CREATE POLICY quote_requests_update ON public.quote_requests
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS quote_requests_delete ON public.quote_requests;
CREATE POLICY quote_requests_delete ON public.quote_requests
  FOR DELETE TO authenticated USING (public.is_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.quote_requests TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quote_requests TO service_role;


-- =============================================================================
-- 2. quote_request_items
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.quote_request_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_request_id uuid NOT NULL REFERENCES public.quote_requests(id) ON DELETE CASCADE,
  -- Product snapshot — the catalog row may be edited, deactivated or
  -- deleted after the request is submitted, but the request must keep
  -- showing exactly what the customer asked for.
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  product_code text NOT NULL,
  product_name text NOT NULL,
  quantity numeric NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit text NOT NULL DEFAULT 'EA',
  -- suggested_price is what the customer saw on the site (or null if
  -- the product had no listed price). The admin can override on review.
  suggested_price numeric,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quote_request_items_request
  ON public.quote_request_items (quote_request_id);

ALTER TABLE public.quote_request_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS quote_request_items_select ON public.quote_request_items;
CREATE POLICY quote_request_items_select ON public.quote_request_items
  FOR SELECT TO authenticated USING (public.is_admin());
DROP POLICY IF EXISTS quote_request_items_insert ON public.quote_request_items;
CREATE POLICY quote_request_items_insert ON public.quote_request_items
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS quote_request_items_update ON public.quote_request_items;
CREATE POLICY quote_request_items_update ON public.quote_request_items
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS quote_request_items_delete ON public.quote_request_items;
CREATE POLICY quote_request_items_delete ON public.quote_request_items
  FOR DELETE TO authenticated USING (public.is_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.quote_request_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quote_request_items TO service_role;


-- =============================================================================
-- quote-request lifecycle cleanup
-- =============================================================================

-- Deletes rejected/cancelled quote requests after a 7-day grace period.
-- Scheduled via pg_cron when the extension is enabled; otherwise called by
-- the application cron job defined in vercel.json.
CREATE OR REPLACE FUNCTION public.cleanup_stale_quote_requests()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted integer;
BEGIN
  DELETE FROM public.quote_requests
  WHERE status IN ('rejected', 'cancelled')
    AND COALESCE(processed_at, updated_at) < now() - interval '7 days';

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

COMMENT ON FUNCTION public.cleanup_stale_quote_requests()
  IS 'Deletes quote requests marked rejected or cancelled more than 7 days ago.';

-- Schedule the cleanup via pg_cron when the extension is available.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'
  ) THEN
    PERFORM cron.unschedule('cleanup-stale-quote-requests');
    PERFORM cron.schedule(
      'cleanup-stale-quote-requests',
      '0 3 * * *',  -- 03:00 UTC daily
      $cron$ SELECT public.cleanup_stale_quote_requests(); $cron$
    );
  END IF;
END $$;


-- =============================================================================
-- 3. ip_bans
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.ip_bans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address inet NOT NULL UNIQUE,
  reason text NOT NULL,
  banned_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  -- Tracks who/what triggered the ban. NULL = automatic, non-NULL = admin.
  banned_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ip_bans_ip_active
  ON public.ip_bans (ip_address)
  WHERE expires_at IS NULL;

ALTER TABLE public.ip_bans ENABLE ROW LEVEL SECURITY;
-- No policies for anon / authenticated. All access via service role.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ip_bans TO service_role;


-- =============================================================================
-- 4. ip_email_log
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.ip_email_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address inet NOT NULL,
  email text NOT NULL,
  -- submission_hash is included so a flood of identical submissions
  -- from one IP can't fill the log. UNIQUE per (ip, email, hour) keeps
  -- the table small while still capturing distinct-email abuse.
  submission_hour timestamptz NOT NULL
    DEFAULT date_trunc('hour', now()),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ip_email_log_unique_per_hour UNIQUE (ip_address, email, submission_hour)
);

CREATE INDEX IF NOT EXISTS idx_ip_email_log_ip_recent
  ON public.ip_email_log (ip_address, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ip_email_log_email_recent
  ON public.ip_email_log (email, created_at DESC);

ALTER TABLE public.ip_email_log ENABLE ROW LEVEL SECURITY;
-- No policies for anon / authenticated. All access via service role.


-- =============================================================================
-- 5. abuse detection + quota functions
-- =============================================================================
-- All three functions are SECURITY DEFINER + search_path pinned to public,
-- so the public-facing API (which uses the service-role client anyway)
-- can call them without needing direct RLS access to the underlying tables.

-- Count quote requests from one email inside a rolling window. Used to
-- enforce the per-email quota.
CREATE OR REPLACE FUNCTION public.count_quote_requests_in_window(
  p_email text,
  p_window_days int DEFAULT 30
)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::int
  FROM public.quote_requests
  WHERE lower(client_email) = lower(p_email)
    AND created_at >= now() - make_interval(days => p_window_days)
    AND status NOT IN ('rejected', 'cancelled');
$$;

-- True when an IP is currently banned (no expiry, or expiry still in
-- the future).
CREATE OR REPLACE FUNCTION public.is_ip_banned(p_ip inet)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.ip_bans
    WHERE ip_address = p_ip
      AND (expires_at IS NULL OR expires_at > now())
  );
$$;

-- Record an (ip, email) submission and detect multi-email abuse from one
-- IP. The threshold is intentionally tight: > 3 distinct emails from one
-- IP in 24 hours means someone is rotating burner emails to dodge the
-- per-email quota.
--
-- Returns the number of *distinct* emails that have submitted from this
-- IP in the last 24 hours (including the one we just logged). The caller
-- compares against the threshold to decide whether to ban.
--
-- Side effect: if the count crosses the threshold AND the IP isn't
-- already banned, the function inserts an ip_bans row automatically.
CREATE OR REPLACE FUNCTION public.record_ip_email(
  p_ip inet,
  p_email text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_distinct_emails int;
  v_already_banned boolean;
  v_threshold constant int := 3;  -- > 3 distinct emails / 24h triggers a ban
BEGIN
  -- Insert one row per (ip, email, hour). The unique constraint dedupes
  -- floods from a single email.
  INSERT INTO public.ip_email_log (ip_address, email)
  VALUES (p_ip, lower(p_email))
  ON CONFLICT (ip_address, email, submission_hour) DO NOTHING;

  -- Count distinct emails from this IP in the last 24 hours.
  SELECT COUNT(DISTINCT lower(email))
    INTO v_distinct_emails
    FROM public.ip_email_log
   WHERE ip_address = p_ip
     AND created_at >= now() - interval '24 hours';

  -- Auto-ban if the threshold is crossed.
  IF v_distinct_emails > v_threshold THEN
    SELECT public.is_ip_banned(p_ip) INTO v_already_banned;
    IF NOT v_already_banned THEN
      INSERT INTO public.ip_bans (ip_address, reason)
      VALUES (
        p_ip,
        format('Auto-ban: %s distinct emails submitted from this IP in the last 24 hours', v_distinct_emails)
      )
      ON CONFLICT (ip_address) DO NOTHING;
    END IF;
  END IF;

  RETURN v_distinct_emails;
END;
$$;

-- Admin: lift an IP ban manually (sets expires_at to the past).
CREATE OR REPLACE FUNCTION public.unban_ip(p_ip inet)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows int;
BEGIN
  UPDATE public.ip_bans
     SET expires_at = now() - interval '1 second'
   WHERE ip_address = p_ip
     AND (expires_at IS NULL OR expires_at > now());
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows > 0;
END;
$$;


-- =============================================================================
-- 6. audit triggers — keep updated_at fresh
-- =============================================================================

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS quote_requests_touch_updated_at ON public.quote_requests;
CREATE TRIGGER quote_requests_touch_updated_at
  BEFORE UPDATE ON public.quote_requests
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
-- <<<<< END supabase/migrations/022_shop.sql <<<<<

-- >>>>> BEGIN supabase/migrations/023_staff_permissions.sql >>>>>
-- 023_staff_permissions.sql
-- Per-staff capability toggles. Stored as JSONB on profiles so an admin
-- can flip individual features on/off from Settings without code changes.
--
-- Schema:
--   {
--     "see_dashboard": bool,
--     "see_clients": bool, "see_products": bool, "see_invoices": bool,
--     "clients": { "add": bool, "edit": bool, "delete": bool, "see_money": bool },
--     "products": { "add": bool, "edit": bool, "delete": bool, "see_prices": bool },
--     "invoices": {
--       "add": bool, "edit": bool, "delete": bool, "see_money": bool,
--       "send_email": bool, "record_payment": bool, "change_status": bool
--     }
--   }
--
-- NULL means "use the code-level defaults" (see lib/auth/permissions.ts).
-- Admin role always gets full access — the column is only consulted for
-- staff users.
--
-- This migration is additive and safe to run on an existing database.
-- Existing rows keep permissions = NULL and inherit defaults at runtime.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS permissions jsonb DEFAULT NULL;

-- Track when the admin last tweaked this row's permissions. Useful for
-- audit + the editor UI ("last changed 3 days ago by …").
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS permissions_updated_at timestamptz DEFAULT NULL;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS permissions_updated_by uuid DEFAULT NULL
    REFERENCES auth.users(id) ON DELETE SET NULL;
-- <<<<< END supabase/migrations/023_staff_permissions.sql <<<<<

-- >>>>> BEGIN supabase/migrations/024_data_integrity_hardening.sql >>>>>
-- =============================================================================
-- Star Hawk Builders Merchant — 024_data_integrity_hardening.sql
-- =============================================================================
-- Closes the data-integrity gaps surfaced by the lib/actions review (June
-- 2026):
--
--   1. clients.email — partial UNIQUE so concurrent quote-request conversions
--      for the same customer can't insert duplicate clients.
--
--   2. invoices.order_number — partial UNIQUE so the random 6-digit order
--      number generator can't silently persist duplicates. The action layer
--      catches 23505 and retries on collision.
--
--   3. client_invitations — partial UNIQUE on (client_id) WHERE status =
--      'pending' so concurrent admin clicks on "Send invite" can't both
--      insert (one wins, the other re-fetches the existing pending row).
--
--   4. accept_invitation() SECURITY DEFINER RPC — wraps the profile update
--      + invitation status flip in a single transaction so a network blip
--      can't leave a customer with role='client' but the invitation still
--      'pending'. Also catches the unique-constraint violation on
--      profiles.client_id and translates it to a friendly error.
--
--   5. convert_quote_to_invoice() SECURITY DEFINER RPC — atomic quote →
--      invoice conversion. The action layer's previous three-call flow
--      (insert invoice → insert items → update quote) could leave orphans
--      if any step failed; this RPC rolls everything into one transaction.
--      On a race the existing UNIQUE INDEX on invoices.converted_from_id
--      keeps a second conversion from sneaking through.
--
--   6. generate_unique_order_number() — atomic order-number allocator. Two
--      callers can race and one will see a retry; the other gets a unique
--      6-digit number on the first try.
--
-- Idempotency: every CREATE / ADD COLUMN / CREATE INDEX is guarded so
-- re-running against an already-migrated DB is a no-op.
-- =============================================================================


-- =============================================================================
-- 1. clients.email — partial UNIQUE
-- =============================================================================
-- A customer can have at most one clients row per email address. Lowercased
-- comparison (citext-style) isn't needed — the application layer normalises
-- to lower-case on insert/update via lib/actions/clients.ts. Live DBs may
-- have legacy duplicates; the DO block backfills them by appending a suffix
-- so the unique index can be created without erroring.
-- =============================================================================

DO $$
DECLARE
  v_dup RECORD;
  v_n int := 1;
BEGIN
  IF EXISTS (
    SELECT 1
      FROM public.clients
     WHERE email IS NOT NULL
     GROUP BY lower(email)
    HAVING COUNT(*) > 1
  ) THEN
    -- Backfill: append a numeric suffix to every duplicate so the unique
    -- index can land. We only touch rows whose lower(email) has >1 match.
    FOR v_dup IN
      SELECT id, email
        FROM public.clients
       WHERE email IS NOT NULL
       ORDER BY id
    LOOP
      UPDATE public.clients
         SET email = v_dup.email || '+legacy' || v_n::text
       WHERE id = v_dup.id
         AND lower(email) IN (
           SELECT lower(email)
             FROM public.clients
            WHERE email IS NOT NULL
            GROUP BY lower(email)
           HAVING COUNT(*) > 1
         );
      v_n := v_n + 1;
    END LOOP;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_email_unique
  ON public.clients(lower(email))
  WHERE email IS NOT NULL;


-- =============================================================================
-- 2. invoices.order_number — partial UNIQUE
-- =============================================================================
-- Two invoices with the same order_number would let a customer-facing 6-digit
-- reference collide. Backfill any legacy duplicates the same way as above
-- (append '+legacy<n>') so the index can land on a live DB.
-- =============================================================================

DO $$
DECLARE
  v_dup RECORD;
  v_n int := 1;
BEGIN
  IF EXISTS (
    SELECT order_number
      FROM public.invoices
     WHERE order_number IS NOT NULL
     GROUP BY order_number
    HAVING COUNT(*) > 1
  ) THEN
    FOR v_dup IN
      SELECT id, order_number
        FROM public.invoices
       WHERE order_number IS NOT NULL
       ORDER BY id
    LOOP
      UPDATE public.invoices
         SET order_number = v_dup.order_number || '+l' || v_n::text
       WHERE id = v_dup.id
         AND order_number IN (
           SELECT order_number
             FROM public.invoices
            WHERE order_number IS NOT NULL
            GROUP BY order_number
           HAVING COUNT(*) > 1
         );
      v_n := v_n + 1;
    END LOOP;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_order_number_unique
  ON public.invoices(order_number)
  WHERE order_number IS NOT NULL;


-- =============================================================================
-- 3. client_invitations(client_id) WHERE status = 'pending' — partial UNIQUE
-- =============================================================================
-- The application deliberately re-uses a single pending invite per client
-- (so re-sending doesn't mint a new token + new audit row). Without this
-- index, two concurrent admin clicks on "Send invite" can both pass the
-- lookup-then-insert and create two pending rows. With the index, the
-- second insert gets a 23505 and the action retries the lookup.
-- =============================================================================

-- Cancel any pre-existing duplicate pending rows before adding the index.
-- Backfill by keeping the oldest pending row and revoking the rest.
DO $$
DECLARE
  v_extra RECORD;
BEGIN
  FOR v_extra IN
    SELECT id, client_id
      FROM (
        SELECT id, client_id,
               row_number() OVER (PARTITION BY client_id ORDER BY created_at ASC) AS rn
          FROM public.client_invitations
         WHERE status = 'pending'
      ) s
     WHERE rn > 1
  LOOP
    UPDATE public.client_invitations
       SET status = 'revoked',
           revoked_at = now()
     WHERE id = v_extra.id;
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_client_invitations_pending_unique
  ON public.client_invitations(client_id)
  WHERE status = 'pending';


-- =============================================================================
-- 4. accept_invitation() — atomic profile update + status flip
-- =============================================================================
-- Combines the two-step accept flow (update profile.role/client_id, then
-- update invite.status='accepted') into a single transaction. A network blip
-- between the steps previously could leave the profile as role='client'
-- while the invite stayed 'pending'.
--
-- Returns the auth user_id that was resolved. If the profile update would
-- collide with an existing profile.client_id (e.g. two concurrent accepts
-- for the same client), raises a SQLSTATE 'P0001' with a friendly message
-- the caller can surface verbatim.
-- =============================================================================

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
  -- already created the auth.users row + supplied the resolved id — we
  -- can't do auth.users inserts from a SECURITY DEFINER pgSQL function
  -- cleanly, so the user-creation step stays in the action layer.
  --
  -- This function ONLY runs the profile-role flip + the invitation
  -- status flip atomically. The action layer passes the resolved user_id
  -- in via a temporary marker: we read it from invite.profile_id (set by
  -- the action layer after createUser succeeds).
  v_user_id := v_invite.profile_id;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Invite has no resolved user. Call the action layer to resolve the auth user first.'
      USING ERRCODE = 'P0001';
  END IF;

  -- Profile flip. Catches the partial unique-index violation on
  -- profiles.client_id and translates it to a friendly error.
  -- Also stamps the client's full name so the portal layout / profile
  -- page can greet the user without a second join. Preserves any
  -- existing full_name if the client record somehow has no name.
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

  -- If the UPDATE affected 0 rows, the profile row is missing (auth.users
  -- exists but profiles row was deleted out from under us). Surface it
  -- so the operator gets a clean error instead of a silently accepted
  -- invite that leaves the user "inactive".
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
    -- Another concurrent caller accepted between our FOR UPDATE and
    -- here (shouldn't happen — the row lock blocks it — but defensive).
    RAISE EXCEPTION 'This invite has already been used.'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN QUERY SELECT v_user_id, v_invite.client_id, v_invite.id, v_invite.email;
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_invitation(text) TO service_role;


-- =============================================================================
-- 5. convert_quote_to_invoice() — atomic quote → invoice conversion
-- =============================================================================
-- Replaces the previous three-call flow in lib/actions/invoices.ts:
--   insert invoice → insert items → update quote.status='converted'
-- A failure between steps could leave an orphan invoice or a quote still
-- in 'sent' state. This RPC runs everything in one transaction.
--
-- Returns the new invoice id. If the source quote is already converted
-- (UNIQUE INDEX on invoices.converted_from_id), raises a SQLSTATE 'P0001'
-- with a friendly message.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.convert_quote_to_invoice(
  p_quote_id uuid,
  p_user_id uuid,
  p_is_admin boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_quote public.invoices;
  v_doc_number text;
  v_invoice_id uuid;
  v_today date := current_date;
  v_due_date date := current_date + INTERVAL '30 days';
  v_client_account text;
  v_your_reference text;
  v_item RECORD;
  v_idx int := 0;
  v_operator_name text;
BEGIN
  -- Lock the source quote row.
  SELECT * INTO v_quote FROM public.invoices WHERE id = p_quote_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quote not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_quote.type <> 'quotation' THEN
    RAISE EXCEPTION 'Source document is not a quotation.' USING ERRCODE = 'P0001';
  END IF;
  IF v_quote.status NOT IN ('draft', 'sent') THEN
    RAISE EXCEPTION 'Only draft or sent quotes can be converted.' USING ERRCODE = 'P0001';
  END IF;
  IF v_quote.created_by <> p_user_id AND NOT p_is_admin THEN
    RAISE EXCEPTION 'Not authorised' USING ERRCODE = '42501';
  END IF;

  -- Look up the operator's display name from the profile of the user performing the conversion
  SELECT COALESCE(full_name, NULLIF(TRIM(CONCAT_WS(' ', first_name, last_name)), ''), 'Unknown Operator')
    INTO v_operator_name
    FROM public.profiles
   WHERE id = p_user_id;

  -- Use the client's current account number, not the quote's old snapshot.
  SELECT account_number INTO v_client_account
    FROM public.clients
   WHERE id = v_quote.client_id;

  v_your_reference := COALESCE(v_quote.your_reference, v_quote.order_number);

  -- Allocate a sequential document number for the new invoice.
  v_doc_number := public.generate_document_number(
    (SELECT invoice_prefix FROM public.company_settings WHERE id = 1)
  );

  -- Insert the new invoice. UNIQUE INDEX on converted_from_id means a
  -- concurrent second call fails here with 23505; we translate it.
  BEGIN
    INSERT INTO public.invoices (
      type, document_number, client_id, issue_date, due_date,
      order_number, account_number, operator_name, your_reference, notes,
      delivery_method,
      delivery_address_line_1, delivery_address_line_2,
      delivery_town, delivery_county, delivery_postcode,
      subtotal, vat_total, total,
      converted_from_id, status, created_by,
      share_token, public_share_enabled, share_token_expires_at
    ) VALUES (
      'invoice', v_doc_number, v_quote.client_id, v_today, v_due_date,
      v_quote.order_number, v_client_account, v_operator_name, v_your_reference, v_quote.notes,
      COALESCE(v_quote.delivery_method, 'delivery'),
      v_quote.delivery_address_line_1, v_quote.delivery_address_line_2,
      v_quote.delivery_town, v_quote.delivery_county, v_quote.delivery_postcode,
      v_quote.subtotal, v_quote.vat_total, v_quote.total,
      p_quote_id, 'draft', p_user_id,
      gen_random_uuid(), false, null
    )
    RETURNING id INTO v_invoice_id;
  EXCEPTION
    WHEN unique_violation THEN
      RAISE EXCEPTION 'This quotation has already been converted to an invoice.'
        USING ERRCODE = 'P0001';
  END;

  -- Copy line items.
  FOR v_item IN
    SELECT product_id, product_name, product_code, unit,
           quantity, price, vat_rate, vat_amount, line_total
      FROM public.invoice_items
     WHERE invoice_id = p_quote_id
     ORDER BY sort_order ASC
  LOOP
    v_idx := v_idx + 1;
    INSERT INTO public.invoice_items (
      invoice_id, product_id, product_name, product_code, unit,
      quantity, price, vat_rate, vat_amount, line_total, sort_order
    ) VALUES (
      v_invoice_id, v_item.product_id, v_item.product_name, v_item.product_code, v_item.unit,
      v_item.quantity, v_item.price, v_item.vat_rate, v_item.vat_amount, v_item.line_total, v_idx
    );
  END LOOP;

  -- Mark the source quote as converted.
  UPDATE public.invoices SET status = 'converted' WHERE id = p_quote_id;

  RETURN v_invoice_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.convert_quote_to_invoice(uuid, uuid, boolean) TO service_role;


-- =============================================================================
-- 6. generate_unique_order_number() — atomic 6-digit number allocator
-- =============================================================================
-- Replaces the Math.random() generator in lib/actions/invoices.ts. Uses a
-- dedicated sequence table so concurrent invoices never collide and the
-- action layer can detect a UNIQUE collision and retry cleanly.
--
-- Format: 6-digit zero-padded integer (e.g. '482910'). Stored as text to
-- match the existing invoices.order_number column type.
--
-- The function never raises on collision — it loops up to 50 times with
-- a fresh candidate, then surfaces a clear error. With 900k possible
-- values and a uniform distribution, a collision burst is rare.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.order_number_sequence (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  next_value bigint NOT NULL DEFAULT 100000
);

INSERT INTO public.order_number_sequence (id, next_value)
VALUES (1, 100000)
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.generate_unique_order_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_attempts int := 0;
  v_candidate text;
BEGIN
  LOOP
    v_attempts := v_attempts + 1;

    -- Atomically reserve the next 6-digit number. Wraps at 999999 back
    -- to 100000 (the user-facing format is fixed-width 6 digits).
    UPDATE public.order_number_sequence
       SET next_value = CASE WHEN next_value >= 999999 THEN 100000 ELSE next_value + 1 END
     WHERE id = 1
    RETURNING next_value - 1 INTO STRICT v_candidate;

    v_candidate := lpad(v_candidate::text, 6, '0');

    -- Return immediately if the candidate doesn't already exist. The
    -- partial UNIQUE index from migration step 2 makes this a strict
    -- guarantee under concurrency — the UPDATE above row-locks the
    -- sequence row, so two callers always get distinct numbers.
    EXIT;
  END LOOP;

  RETURN v_candidate;
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_unique_order_number() TO authenticated;


-- =============================================================================
-- 7. products.created_by — owner column for defense-in-depth on edits/deletes
-- =============================================================================
-- Products are admin-only-writable today via RLS, so the application layer's
-- product-mutation guards are technically belt-and-braces. We still want
-- per-product ownership recorded so the action layer can enforce "only the
-- creator (or an admin) can edit/delete" without relying on RLS being
-- unchanged forever. Without this column, anyone with the products_edit
-- toggle could mutate any product row if RLS were ever relaxed.
--
-- Existing rows backfill to NULL — the action treats NULL as "no recorded
-- owner" and falls back to "admin-only" for those legacy rows.
-- =============================================================================

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_products_created_by
  ON public.products(created_by)
  WHERE created_by IS NOT NULL;

-- <<<<< END supabase/migrations/024_data_integrity_hardening.sql <<<<<

-- >>>>> BEGIN supabase/migrations/025_security_hardening.sql >>>>>
-- =============================================================================
-- Star Hawk Builders Merchant — 025_security_hardening.sql
-- =============================================================================
-- Defence-in-depth tightening surfaced by the security review:
--
--   1. client_invitations.token — hide the credential from authenticated
--      users. Staff never need to read the raw token; the service-role action
--      layer handles minting / looking up tokens when sending or accepting
--      invites. This removes the info-disclosure window where any operator who
--      can see a client also sees every pending invite token.
--
--   2. count_quote_requests_in_window() — restrict execution to the service
--      role. The function counts requests for any email and is only called from
--      submitQuoteRequest via admin.rpc. Revoking PUBLIC execution prevents it
--      from ever being exposed to anon/authenticated callers accidentally.
--
-- Idempotency: REVOKE / GRANT are safe to re-run.
-- =============================================================================

-- =============================================================================
-- 1. Don't leak invite tokens to authenticated staff users
-- =============================================================================

REVOKE SELECT (token) ON public.client_invitations FROM authenticated;


-- =============================================================================
-- 2. quote-request quota counter: service_role only
-- =============================================================================

REVOKE EXECUTE ON FUNCTION public.count_quote_requests_in_window(text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.count_quote_requests_in_window(text, integer) TO service_role;
-- <<<<< END supabase/migrations/025_security_hardening.sql <<<<<

-- >>>>> BEGIN supabase/migrations/026_client_profile_rls_hardening.sql >>>>>
-- =============================================================================
-- Star Hawk Builders Merchant — 025_client_profile_rls_hardening.sql
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

  -- Only administrators may change client linkage or active status.
  IF NEW.client_id IS DISTINCT FROM OLD.client_id
     OR NEW.is_active IS DISTINCT FROM OLD.is_active THEN
    IF NOT public.is_admin() THEN
      RAISE EXCEPTION 'Only administrators can change client link or active status.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Role changes are admin-only. Allowing team managers (settings_manage_team)
  -- to transition roles between admin and staff created a privilege-escalation
  -- path where a staff user could promote themselves to admin by calling the
  -- Supabase client directly and bypassing the application layer.
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    IF NOT public.is_admin() THEN
      RAISE EXCEPTION 'Only administrators can change role.'
        USING ERRCODE = '42501';
    END IF;
    IF NEW.role NOT IN ('admin', 'staff', 'client') OR OLD.role NOT IN ('admin', 'staff', 'client') THEN
      RAISE EXCEPTION 'Invalid role transition.'
        USING ERRCODE = '42501';
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

DROP TRIGGER IF EXISTS profiles_enforce_update_scope ON public.profiles;
CREATE TRIGGER profiles_enforce_update_scope
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_profile_update_scope();


-- -----------------------------------------------------------------------------
-- 2. Replace the self-or-admin UPDATE policy with a tighter one.
-- -----------------------------------------------------------------------------
-- The trigger above enforces column restrictions; the policy now only needs to
-- decide *which rows* a user may touch. Admins may touch any row; non-admins
-- may touch only their own row, while team managers may also touch staff/admin
-- rows so they can promote or demote users. We keep the name stable so existing
-- grants and docs referencing it remain valid.
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
    RAISE EXCEPTION 'This email belongs to an existing staff, admin, or picker account and cannot be used for the client portal.'
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
-- <<<<< END supabase/migrations/026_client_profile_rls_hardening.sql <<<<<

-- =============================================================================
-- supabase/migrations/039_company_logos_bucket.sql — INLINED BELOW
-- =============================================================================
-- Storage bucket for company logos. Public read so PDF renderers, email
-- clients, and public invoice views can fetch the image without an auth token.
-- Writes start as admin-only here; migration 045 widens them to also allow
-- staff with settings_edit_company.
-- =============================================================================

INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'logos',
  'logos',
  true,
  5242880, -- 5 MB
  ARRAY[
    'image/png',
    'image/jpeg',
    'image/gif',
    'image/webp',
    'image/svg+xml'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Public read access for logos (needed by react-pdf, email clients, public views)
DROP POLICY IF EXISTS "Public read access on logos" ON storage.objects;
CREATE POLICY "Public read access on logos"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'logos');

-- Admin-only write policies (migration 045 recreates these for staff editors too)
DROP POLICY IF EXISTS "Admin insert on logos" ON storage.objects;
CREATE POLICY "Admin insert on logos"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'logos'
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  )
);

DROP POLICY IF EXISTS "Admin update on logos" ON storage.objects;
CREATE POLICY "Admin update on logos"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'logos'
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  )
)
WITH CHECK (bucket_id = 'logos');

DROP POLICY IF EXISTS "Admin delete on logos" ON storage.objects;
CREATE POLICY "Admin delete on logos"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'logos'
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  )
);
-- <<<<< END supabase/migrations/039_company_logos_bucket.sql <<<<<


-- =============================================================================
-- supabase/migrations/047_user_access_tracking.sql — INLINED BELOW
-- =============================================================================
-- Adds last_sign_in_at / last_active_at to profiles and guards the last admin
-- against deactivation or deletion.
-- =============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_sign_in_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_active_at timestamptz;

-- New profiles start with no access timestamps; handle_new_user() omits these
-- columns so they default to NULL.

-- Prevent deactivating the last active admin.
CREATE OR REPLACE FUNCTION public.guard_last_admin_on_deactivate()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_admin_count int;
BEGIN
  IF NOT (OLD.role = 'admin' AND OLD.is_active = true AND NEW.is_active = false) THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO v_admin_count
    FROM public.profiles
   WHERE role = 'admin' AND is_active = true AND id <> OLD.id;

  IF v_admin_count = 0 THEN
    RAISE EXCEPTION 'Cannot suspend the last active admin. Promote a replacement first.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_guard_last_admin_on_deactivate ON public.profiles;
CREATE TRIGGER profiles_guard_last_admin_on_deactivate
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_last_admin_on_deactivate();

-- Prevent deleting the last admin.
CREATE OR REPLACE FUNCTION public.guard_last_admin_on_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_admin_count int;
BEGIN
  IF OLD.role <> 'admin' THEN
    RETURN OLD;
  END IF;

  SELECT count(*) INTO v_admin_count
    FROM public.profiles
   WHERE role = 'admin' AND id <> OLD.id;

  IF v_admin_count = 0 THEN
    RAISE EXCEPTION 'Cannot delete the last admin. Promote a replacement first.'
      USING ERRCODE = '42501';
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS profiles_guard_last_admin_on_delete ON public.profiles;
CREATE TRIGGER profiles_guard_last_admin_on_delete
  BEFORE DELETE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_last_admin_on_delete();
-- <<<<< END supabase/migrations/047_user_access_tracking.sql <<<<<


-- =============================================================================
-- supabase/migrations/060_product_fuzzy_search.sql — INLINED BELOW
-- =============================================================================
-- Adds a generated full-text search document and pg_trgm trigram indexes on
-- products, plus a search_products() RPC for typo-tolerant, ranked search.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS search_document tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(code, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(mpn, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(category, '')), 'C') ||
    setweight(to_tsvector('english', coalesce(brand, '')), 'C') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'D') ||
    setweight(to_tsvector('english', coalesce(short_description, '')), 'D') ||
    setweight(to_tsvector('english', coalesce(seo_title, '')), 'D') ||
    setweight(to_tsvector('english', coalesce(seo_description, '')), 'D') ||
    setweight(jsonb_to_tsvector('english'::regconfig, coalesce(key_features, '[]'::jsonb), '["string"]'::jsonb), 'D') ||
    setweight(jsonb_to_tsvector('english'::regconfig, coalesce(applications, '[]'::jsonb), '["string"]'::jsonb), 'D')
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_products_search_document
  ON public.products USING GIN(search_document);

CREATE INDEX IF NOT EXISTS idx_products_name_trgm
  ON public.products USING GIN(name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_products_code_trgm
  ON public.products USING GIN(code gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_products_category_trgm
  ON public.products USING GIN(category gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_products_brand_trgm
  ON public.products USING GIN(brand gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_products_description_trgm
  ON public.products USING GIN(description gin_trgm_ops);

CREATE OR REPLACE FUNCTION public.search_products(
  p_query text,
  p_limit integer DEFAULT 20,
  p_active_only boolean DEFAULT true
)
RETURNS SETOF public.products
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_query text := trim(coalesce(p_query, ''));
  v_fts_query tsquery;
BEGIN
  IF v_query = '' THEN
    RETURN QUERY
    SELECT p.*
    FROM public.products p
    WHERE (NOT p_active_only OR p.is_active = true)
    ORDER BY p.name
    LIMIT p_limit;
    RETURN;
  END IF;

  v_fts_query := websearch_to_tsquery('english', v_query);

  CREATE TEMP TABLE IF NOT EXISTS _search_product_results (
    id uuid PRIMARY KEY,
    stage int NOT NULL,
    score numeric NOT NULL
  ) ON COMMIT DROP;

  TRUNCATE _search_product_results;

  INSERT INTO _search_product_results (id, stage, score)
  SELECT p.id, 1, ts_rank_cd(p.search_document, v_fts_query, 32)
  FROM public.products p
  WHERE (NOT p_active_only OR p.is_active = true)
    AND p.search_document @@ v_fts_query
  ON CONFLICT (id) DO NOTHING;

  -- Stage B: trigram similarity fallback for typos and partial words.
  -- We use an explicit similarity threshold because the % operator relies on
  -- a session setting that is not always respected by connection pools.
  INSERT INTO _search_product_results (id, stage, score)
  SELECT p.id, 2, greatest(
    similarity(p.name, v_query),
    similarity(p.code, v_query),
    similarity(p.category, v_query),
    similarity(p.brand, v_query),
    similarity(p.description, v_query)
  )
  FROM public.products p
  WHERE (NOT p_active_only OR p.is_active = true)
    AND NOT EXISTS (
      SELECT 1 FROM _search_product_results r WHERE r.id = p.id
    )
    AND (
      similarity(p.name, v_query) > 0.15
      OR similarity(p.code, v_query) > 0.15
      OR similarity(p.category, v_query) > 0.15
      OR similarity(p.brand, v_query) > 0.15
      OR similarity(p.description, v_query) > 0.15
    )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO _search_product_results (id, stage, score)
  SELECT p.id, 3, 0.0
  FROM public.products p
  WHERE (NOT p_active_only OR p.is_active = true)
    AND NOT EXISTS (
      SELECT 1 FROM _search_product_results r WHERE r.id = p.id
    )
    AND (
      p.name ILIKE '%' || v_query || '%'
      OR p.code ILIKE '%' || v_query || '%'
      OR p.description ILIKE '%' || v_query || '%'
    )
  ON CONFLICT (id) DO NOTHING;

  RETURN QUERY
  SELECT p.*
  FROM public.products p
  JOIN _search_product_results r ON r.id = p.id
  ORDER BY r.stage, r.score DESC, p.name
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.search_products(text, integer, boolean) TO anon, authenticated;
-- <<<<< END supabase/migrations/060_product_fuzzy_search.sql <<<<<

-- =============================================================================
-- supabase/migrations/061_product_search_tags.sql — INLINED BELOW
-- =============================================================================
-- Adds search_tags to products and folds them into the hybrid search.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.array_to_text(p_tags text[])
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT string_agg(x, ' ') FROM unnest(coalesce(p_tags, ARRAY[]::text[])) x;
$$;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS search_tags text[] NOT NULL DEFAULT '{}';

ALTER TABLE public.products
  DROP COLUMN IF EXISTS search_document;

ALTER TABLE public.products
  ADD COLUMN search_document tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(code, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(mpn, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(category, '')), 'C') ||
    setweight(to_tsvector('english', coalesce(brand, '')), 'C') ||
    setweight(to_tsvector('english', coalesce(public.array_to_text(search_tags), '')), 'C') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'D') ||
    setweight(to_tsvector('english', coalesce(short_description, '')), 'D') ||
    setweight(to_tsvector('english', coalesce(seo_title, '')), 'D') ||
    setweight(to_tsvector('english', coalesce(seo_description, '')), 'D') ||
    setweight(jsonb_to_tsvector('english'::regconfig, coalesce(key_features, '[]'::jsonb), '["string"]'::jsonb), 'D') ||
    setweight(jsonb_to_tsvector('english'::regconfig, coalesce(applications, '[]'::jsonb), '["string"]'::jsonb), 'D')
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_products_search_document
  ON public.products USING GIN(search_document);

CREATE OR REPLACE FUNCTION public.search_products(
  p_query text,
  p_limit integer DEFAULT 20,
  p_active_only boolean DEFAULT true
)
RETURNS SETOF public.products
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_query text := trim(coalesce(p_query, ''));
  v_fts_query tsquery;
BEGIN
  IF v_query = '' THEN
    RETURN QUERY
    SELECT p.*
    FROM public.products p
    WHERE (NOT p_active_only OR p.is_active = true)
    ORDER BY p.name
    LIMIT p_limit;
    RETURN;
  END IF;

  v_fts_query := websearch_to_tsquery('english', v_query);

  CREATE TEMP TABLE IF NOT EXISTS _search_product_results (
    id uuid PRIMARY KEY,
    stage int NOT NULL,
    score numeric NOT NULL
  ) ON COMMIT DROP;

  TRUNCATE _search_product_results;

  INSERT INTO _search_product_results (id, stage, score)
  SELECT p.id, 1, ts_rank_cd(p.search_document, v_fts_query, 32)
  FROM public.products p
  WHERE (NOT p_active_only OR p.is_active = true)
    AND p.search_document @@ v_fts_query
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO _search_product_results (id, stage, score)
  SELECT p.id, 2, greatest(
    similarity(p.name, v_query),
    similarity(p.code, v_query),
    similarity(p.category, v_query),
    similarity(p.brand, v_query),
    similarity(coalesce(public.array_to_text(p.search_tags), ''), v_query),
    similarity(p.description, v_query)
  )
  FROM public.products p
  WHERE (NOT p_active_only OR p.is_active = true)
    AND NOT EXISTS (
      SELECT 1 FROM _search_product_results r WHERE r.id = p.id
    )
    AND (
      similarity(p.name, v_query) > 0.18
      OR similarity(p.code, v_query) > 0.18
      OR similarity(p.category, v_query) > 0.18
      OR similarity(p.brand, v_query) > 0.18
      OR similarity(coalesce(public.array_to_text(p.search_tags), ''), v_query) > 0.18
      OR similarity(p.description, v_query) > 0.18
    )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO _search_product_results (id, stage, score)
  SELECT p.id, 3, 0.0
  FROM public.products p
  WHERE (NOT p_active_only OR p.is_active = true)
    AND NOT EXISTS (
      SELECT 1 FROM _search_product_results r WHERE r.id = p.id
    )
    AND (
      p.name ILIKE '%' || v_query || '%'
      OR p.code ILIKE '%' || v_query || '%'
      OR coalesce(public.array_to_text(p.search_tags), '') ILIKE '%' || v_query || '%'
      OR p.description ILIKE '%' || v_query || '%'
    )
  ON CONFLICT (id) DO NOTHING;

  RETURN QUERY
  SELECT p.*
  FROM public.products p
  JOIN _search_product_results r ON r.id = p.id
  ORDER BY r.stage, r.score DESC, p.name
  LIMIT p_limit;
END;
$$;

UPDATE public.products SET search_tags = ARRAY['dpc', 'damp proof course']::text[] WHERE code = '450' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['dpc', 'damp proof course']::text[] WHERE code = '600' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['mortar admixture', 'mortar plasticizer']::text[] WHERE code = 'ADMIX' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['cement', 'portland cement', 'general purpose cement']::text[] WHERE code = 'AGG-001' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['sand', 'sharp sand', 'grit sand']::text[] WHERE code = 'AGG-002' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['sand', 'rendering sand']::text[] WHERE code = 'AGG-003' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['mot type 1', 'hardcore', 'sub base', 'sub-base']::text[] WHERE code = 'AGG-004' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['sand', 'building sand', 'soft sand']::text[] WHERE code = 'AGG-005' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['gravel', 'shingle', 'decorative stone', 'aggregate', 'pea shingle']::text[] WHERE code = 'AGG-006' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['gravel', 'aggregate', 'ballast', 'all in ballast']::text[] WHERE code = 'AGG-007' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['gravel', 'shingle', 'decorative stone', 'aggregate', 'pea shingle']::text[] WHERE code = 'AGG-008' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['sand', 'plaster sand']::text[] WHERE code = 'AGG-009' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['block', 'building block', 'dense block', 'concrete block', 'solid block']::text[] WHERE code = 'BLO-001' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['block', 'building block', 'dense block', 'concrete block', 'solid block', 'medium dense block']::text[] WHERE code = 'BLO-002' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['block', 'building block', 'hollow block', 'concrete block']::text[] WHERE code = 'BLO-003' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['block', 'building block', 'thermalite', 'aircrete', 'lightweight block']::text[] WHERE code = 'BLO-004' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['brick', 'facing brick']::text[] WHERE code = 'BRI-001' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['brick', 'facing brick', 'stock brick']::text[] WHERE code = 'BRI-002' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['brick', 'facing brick']::text[] WHERE code = 'BRI-004' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['brick', 'facing brick']::text[] WHERE code = 'BRI-005' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['brick', 'facing brick', 'stock brick']::text[] WHERE code = 'BRI-006' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['brick', 'facing brick']::text[] WHERE code = 'BRI-007' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['brick', 'facing brick']::text[] WHERE code = 'BRI-008' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['brick', 'facing brick']::text[] WHERE code = 'BRI-009' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['brick', 'facing brick']::text[] WHERE code = 'BRI-011' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['brick', 'facing brick', 'engineering brick']::text[] WHERE code = 'BRI-012' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['brick', 'facing brick']::text[] WHERE code = 'BRI-013' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['brick', 'facing brick']::text[] WHERE code = 'BRI-014' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['brick', 'facing brick']::text[] WHERE code = 'BRI-015' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['brick', 'facing brick']::text[] WHERE code = 'BRI-016' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['brick', 'facing brick', 'common brick']::text[] WHERE code = 'BRI-017' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['brick', 'facing brick']::text[] WHERE code = 'BRI-018' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['brick', 'facing brick']::text[] WHERE code = 'BRI-019' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['brick', 'facing brick']::text[] WHERE code = 'BRI-020' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['brick', 'facing brick']::text[] WHERE code = 'BRI-021' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['brick', 'facing brick']::text[] WHERE code = 'BRI-022' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['brick', 'facing brick']::text[] WHERE code = 'BRI-023' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['brick', 'facing brick']::text[] WHERE code = 'BRI-024' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['brick', 'facing brick']::text[] WHERE code = 'BRI-025' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['brick', 'facing brick']::text[] WHERE code = 'BRI-026' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['brick', 'facing brick']::text[] WHERE code = 'BRI-028' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['brick', 'facing brick']::text[] WHERE code = 'BRI-029' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['brick', 'facing brick']::text[] WHERE code = 'BRI-030' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['brick', 'facing brick']::text[] WHERE code = 'BRI-031' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['brick', 'facing brick']::text[] WHERE code = 'BRI-032' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['brick', 'facing brick']::text[] WHERE code = 'BRI-033' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['brick']::text[] WHERE code = 'BRICK' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['insulation', 'breathable membrane', 'roof membrane']::text[] WHERE code = 'CAV-001' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['insulation', 'acoustic insulation', 'sound insulation']::text[] WHERE code = 'CAV-003' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['insulation', 'loft insulation', 'insulation roll']::text[] WHERE code = 'CAV-004' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['insulation', 'cavity insulation', 'wall insulation']::text[] WHERE code = 'CAV-006' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['insulation', 'cavity insulation', 'wall insulation']::text[] WHERE code = 'CAV-007' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['insulation', 'cavity insulation', 'wall insulation']::text[] WHERE code = 'CAV-008' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['dpc', 'damp proof course']::text[] WHERE code = 'DPC' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['dpc', 'damp proof course']::text[] WHERE code = 'DPC-150' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['dpc', 'damp proof course']::text[] WHERE code = 'DPC-200' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['dpc', 'damp proof course']::text[] WHERE code = 'DPC-225' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['dpc', 'damp proof course']::text[] WHERE code = 'DPC-300' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['wall ties', 'cavity ties']::text[] WHERE code = 'FIX-001' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['wall ties', 'cavity ties']::text[] WHERE code = 'FIX-002' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['restraint strap']::text[] WHERE code = 'FIX-003' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['brick reinforcement', 'mesh']::text[] WHERE code = 'FIX-004' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['gallows bracket']::text[] WHERE code = 'FIX-005' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['fixing band']::text[] WHERE code = 'FIX-006' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['wall starter']::text[] WHERE code = 'FIX-007' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['joist hanger']::text[] WHERE code = 'FIX-008' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['screws']::text[] WHERE code = 'FIX-009' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['screws']::text[] WHERE code = 'FIX-010' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['screws']::text[] WHERE code = 'FIX-011' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['screws']::text[] WHERE code = 'FIX-012' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['nails']::text[] WHERE code = 'FIX-013' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['nails']::text[] WHERE code = 'FIX-014' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['nails', 'joist hanger']::text[] WHERE code = 'FIX-015' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['screws']::text[] WHERE code = 'FIX-016' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['insulation', 'eps insulation', 'polystyrene insulation']::text[] WHERE code = 'PIR-001' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['insulation', 'pir insulation', 'rigid insulation', 'foam board']::text[] WHERE code = 'PIR-003' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['insulation', 'pir insulation', 'rigid insulation', 'foam board']::text[] WHERE code = 'PIR-004' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['insulation', 'pir insulation', 'rigid insulation', 'foam board']::text[] WHERE code = 'PIR-005' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['insulation', 'pir insulation', 'rigid insulation', 'foam board']::text[] WHERE code = 'PIR-006' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['insulation', 'pir insulation', 'rigid insulation', 'foam board']::text[] WHERE code = 'PIR-007' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['insulation', 'pir insulation', 'rigid insulation', 'foam board']::text[] WHERE code = 'PIR-008' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['plasterboard', 'plaster board', 'drywall', 'gypsum board', 'hardwall plaster', 'plaster']::text[] WHERE code = 'PLA-001' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['plasterboard', 'plaster board', 'drywall', 'gypsum board', 'bonding coat', 'plaster']::text[] WHERE code = 'PLA-002' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['plasterboard', 'plaster board', 'drywall', 'gypsum board', 'multifinish', 'finish plaster']::text[] WHERE code = 'PLA-003' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['plasterboard', 'plaster board', 'drywall', 'gypsum board', 'insulated plasterboard', 'thermal board']::text[] WHERE code = 'PLA-004' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['plasterboard', 'plaster board', 'drywall', 'gypsum board', 'moisture resistant plasterboard', 'green board', 'bathroom plasterboard']::text[] WHERE code = 'PLA-005' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['plasterboard', 'plaster board', 'drywall', 'gypsum board', 'acoustic plasterboard', 'sound board']::text[] WHERE code = 'PLA-006' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['plasterboard', 'plaster board', 'drywall', 'gypsum board', 'fire rated plasterboard', 'fire board']::text[] WHERE code = 'PLA-007' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['plasterboard', 'plaster board', 'drywall', 'gypsum board', 'standard plasterboard']::text[] WHERE code = 'PLA-008' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['fascia', 'fascia board', 'fascia and soffit']::text[] WHERE code = 'ROO-001' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['gutter', 'guttering', 'rainwater', 'upvc gutter']::text[] WHERE code = 'ROO-002' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['fascia', 'fascia board', 'fascia and soffit', 'gutter', 'guttering', 'rainwater', 'upvc gutter']::text[] WHERE code = 'ROO-003' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['roofing felt', 'bitumen felt', 'torch on felt']::text[] WHERE code = 'ROO-004' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['roofing felt', 'bitumen felt', 'torch on felt']::text[] WHERE code = 'ROO-005' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['dpc', 'damp proof course']::text[] WHERE code = 'ROO-006' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['dpm', 'damp proof membrane']::text[] WHERE code = 'ROO-007' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['grp', 'fibreglass roofing', 'flat roof']::text[] WHERE code = 'ROO-008' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['grp', 'fibreglass roofing', 'flat roof']::text[] WHERE code = 'ROO-009' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['grp', 'fibreglass roofing', 'flat roof']::text[] WHERE code = 'ROO-010' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['grp', 'fibreglass roofing', 'flat roof']::text[] WHERE code = 'ROO-011' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['grp', 'fibreglass roofing', 'flat roof']::text[] WHERE code = 'ROO-012' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['grp', 'fibreglass roofing', 'flat roof']::text[] WHERE code = 'ROO-013' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['grp', 'fibreglass roofing', 'flat roof']::text[] WHERE code = 'ROO-014' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['grp', 'fibreglass roofing', 'flat roof']::text[] WHERE code = 'ROO-015' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['grp', 'fibreglass roofing', 'flat roof']::text[] WHERE code = 'ROO-016' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['osb', 'osb board', 'osb3', 'oriented strand board', 'plywood', 'ply', 'sheet board']::text[] WHERE code = 'SHE-001' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['chipboard', 'chipboard flooring', 'flooring board']::text[] WHERE code = 'SHE-003' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['plywood', 'ply', 'sheet board', 'shuttering plywood', 'shuttering ply', 'formwork plywood']::text[] WHERE code = 'SHE-004' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['plywood', 'ply', 'sheet board', 'wbp plywood', 'exterior plywood']::text[] WHERE code = 'SHE-005' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['osb', 'osb board', 'osb3', 'oriented strand board']::text[] WHERE code = 'SHE-006' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['osb', 'osb board', 'osb3', 'oriented strand board', 'plywood', 'ply', 'sheet board']::text[] WHERE code = 'SHE-007' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['plywood', 'ply', 'sheet board', 'wbp plywood', 'exterior plywood']::text[] WHERE code = 'SHE-008' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['chipboard', 'chipboard flooring', 'flooring board']::text[] WHERE code = 'SHE-009' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['steel beam', 'rsj', 'structural steel', 'universal beam']::text[] WHERE code = 'STL-001' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['steel beam', 'rsj', 'structural steel', 'universal beam']::text[] WHERE code = 'STL-002' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['steel beam', 'rsj', 'structural steel', 'universal beam']::text[] WHERE code = 'STL-003' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['steel beam', 'rsj', 'structural steel', 'universal beam', 'steel box section', 'shs']::text[] WHERE code = 'STL-004' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['steel beam', 'rsj', 'structural steel', 'universal beam', 'steel channel', 'pfc']::text[] WHERE code = 'STL-005' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['steel beam', 'rsj', 'structural steel', 'universal beam', 'angle steel', 'steel angle']::text[] WHERE code = 'STL-006' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['lintel', 'steel lintel', 'cavity lintel']::text[] WHERE code = 'STL-007' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['lintel', 'steel lintel', 'cavity lintel']::text[] WHERE code = 'STL-008' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['lintel', 'steel lintel', 'cavity lintel']::text[] WHERE code = 'STL-009' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['lintel', 'steel lintel', 'cavity lintel']::text[] WHERE code = 'STL-010' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['lintel', 'steel lintel', 'cavity lintel']::text[] WHERE code = 'STL-011' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['lintel', 'steel lintel', 'cavity lintel']::text[] WHERE code = 'STL-012' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['lintel', 'steel lintel', 'cavity lintel']::text[] WHERE code = 'STL-013' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['timber', 'c24 timber', 'carcassing timber', 'structural timber', 'batten', 'roofing batten', 'timber batten']::text[] WHERE code = 'TIM-001' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['timber', 'c24 timber', 'carcassing timber', 'structural timber']::text[] WHERE code = 'TIM-002' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['timber', 'c24 timber', 'carcassing timber', 'structural timber', '3x2 timber']::text[] WHERE code = 'TIM-003' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['timber', 'c24 timber', 'carcassing timber', 'structural timber', '3x2 timber']::text[] WHERE code = 'TIM-004' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['timber', 'c24 timber', 'carcassing timber', 'structural timber', '3x2 timber']::text[] WHERE code = 'TIM-005' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['timber', 'c24 timber', 'carcassing timber', 'structural timber', '3x2 timber']::text[] WHERE code = 'TIM-006' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['timber', 'c24 timber', 'carcassing timber', 'structural timber', '3x2 timber']::text[] WHERE code = 'TIM-007' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['timber', 'c24 timber', 'carcassing timber', 'structural timber', '3x2 timber']::text[] WHERE code = 'TIM-008' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['timber', 'c24 timber', 'carcassing timber', 'structural timber', '3x2 timber']::text[] WHERE code = 'TIM-009' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['timber', 'c24 timber', 'carcassing timber', 'structural timber', '4x2 timber']::text[] WHERE code = 'TIM-010' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['timber', 'c24 timber', 'carcassing timber', 'structural timber', '4x2 timber']::text[] WHERE code = 'TIM-011' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['timber', 'c24 timber', 'carcassing timber', 'structural timber', '4x2 timber']::text[] WHERE code = 'TIM-012' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['timber', 'c24 timber', 'carcassing timber', 'structural timber', '4x2 timber']::text[] WHERE code = 'TIM-013' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['timber', 'c24 timber', 'carcassing timber', 'structural timber', '4x2 timber']::text[] WHERE code = 'TIM-014' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['timber', 'c24 timber', 'carcassing timber', 'structural timber', '4x2 timber']::text[] WHERE code = 'TIM-015' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['timber', 'c24 timber', 'carcassing timber', 'structural timber', '4x2 timber']::text[] WHERE code = 'TIM-016' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['timber', 'c24 timber', 'carcassing timber', 'structural timber', '6x2 timber']::text[] WHERE code = 'TIM-017' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['timber', 'c24 timber', 'carcassing timber', 'structural timber', '6x2 timber']::text[] WHERE code = 'TIM-018' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['timber', 'c24 timber', 'carcassing timber', 'structural timber', '6x2 timber']::text[] WHERE code = 'TIM-019' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['timber', 'c24 timber', 'carcassing timber', 'structural timber', '6x2 timber']::text[] WHERE code = 'TIM-020' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['timber', 'c24 timber', 'carcassing timber', 'structural timber', '6x2 timber']::text[] WHERE code = 'TIM-021' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['timber', 'c24 timber', 'carcassing timber', 'structural timber', '6x2 timber']::text[] WHERE code = 'TIM-022' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['timber', 'c24 timber', 'carcassing timber', 'structural timber', '6x2 timber']::text[] WHERE code = 'TIM-023' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['timber', 'c24 timber', 'carcassing timber', 'structural timber', '7x2 timber']::text[] WHERE code = 'TIM-024' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['timber', 'c24 timber', 'carcassing timber', 'structural timber', '7x2 timber']::text[] WHERE code = 'TIM-025' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['timber', 'c24 timber', 'carcassing timber', 'structural timber', '7x2 timber']::text[] WHERE code = 'TIM-026' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['timber', 'c24 timber', 'carcassing timber', 'structural timber', '7x2 timber']::text[] WHERE code = 'TIM-027' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['timber', 'c24 timber', 'carcassing timber', 'structural timber', '7x2 timber']::text[] WHERE code = 'TIM-028' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['timber', 'c24 timber', 'carcassing timber', 'structural timber', '7x2 timber']::text[] WHERE code = 'TIM-029' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['timber', 'c24 timber', 'carcassing timber', 'structural timber', '7x2 timber']::text[] WHERE code = 'TIM-030' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['timber', 'c24 timber', 'carcassing timber', 'structural timber', '8x2 timber']::text[] WHERE code = 'TIM-031' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['timber', 'c24 timber', 'carcassing timber', 'structural timber', '8x2 timber']::text[] WHERE code = 'TIM-032' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['timber', 'c24 timber', 'carcassing timber', 'structural timber', '8x2 timber']::text[] WHERE code = 'TIM-033' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['timber', 'c24 timber', 'carcassing timber', 'structural timber', '8x2 timber']::text[] WHERE code = 'TIM-034' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['timber', 'c24 timber', 'carcassing timber', 'structural timber', '8x2 timber']::text[] WHERE code = 'TIM-035' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['timber', 'c24 timber', 'carcassing timber', 'structural timber', '8x2 timber']::text[] WHERE code = 'TIM-036' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['timber', 'c24 timber', 'carcassing timber', 'structural timber', '8x2 timber']::text[] WHERE code = 'TIM-037' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['timber', 'c24 timber', 'carcassing timber', 'structural timber', '9x2 timber']::text[] WHERE code = 'TIM-038' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['timber', 'c24 timber', 'carcassing timber', 'structural timber', '9x2 timber']::text[] WHERE code = 'TIM-039' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['timber', 'c24 timber', 'carcassing timber', 'structural timber', '9x2 timber']::text[] WHERE code = 'TIM-040' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['timber', 'c24 timber', 'carcassing timber', 'structural timber', '9x2 timber']::text[] WHERE code = 'TIM-041' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['timber', 'c24 timber', 'carcassing timber', 'structural timber', '9x2 timber']::text[] WHERE code = 'TIM-042' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['timber', 'c24 timber', 'carcassing timber', 'structural timber', '9x2 timber']::text[] WHERE code = 'TIM-043' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['timber', 'c24 timber', 'carcassing timber', 'structural timber', '9x2 timber']::text[] WHERE code = 'TIM-044' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['timber', 'c24 timber', 'carcassing timber', 'structural timber', 'batten', 'roofing batten', 'timber batten']::text[] WHERE code = 'TIM-045' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['wall starter']::text[] WHERE code = 'UNI' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['wall ties', 'cavity ties']::text[] WHERE code = 'WALLTIES 250MM' AND is_active = true;

-- <<<<< END supabase/migrations/061_product_search_tags.sql <<<<<
-- >>>>> BEGIN supabase/migrations/062_invoice_template_fax_website_advice_note.sql <<<<<

-- Migration 062: invoice template fields for the Gill Aggregates-style layout.
-- Adds optional fields that the new invoice template reads (matching the
-- source K8 invoice). All nullable so existing rows are unaffected.

ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS fax text,
  ADD COLUMN IF NOT EXISTS website text;

COMMENT ON COLUMN public.company_settings.fax IS 'Fax number shown in the invoice header (Gill Aggregates-style layout). Optional -- omitted when blank.';
COMMENT ON COLUMN public.company_settings.website IS 'Website URL shown in the invoice header (Gill Aggregates-style layout). Optional -- omitted when blank.';

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS advice_note_number text,
  ADD COLUMN IF NOT EXISTS advice_note_date date;

COMMENT ON COLUMN public.invoices.advice_note_number IS 'Optional advice note number shown as a header band on the line-items table. When null the band is omitted.';
COMMENT ON COLUMN public.invoices.advice_note_date IS 'Date associated with the advice note. Optional.';

-- >>>>> END supabase/migrations/062_invoice_template_fax_website_advice_note.sql <<<<<


-- >>>>> BEGIN supabase/migrations/072_replace_company_contact_channels.sql <<<<<

-- Atomic replacement of company phone/email channels.
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
  IF NOT public.is_admin() THEN
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

-- >>>>> End supabase/migrations/072_replace_company_contact_channels.sql <<<<<
-- >>>>> BEGIN supabase/migrations/073_convert_quote_request_to_invoice.sql <<<<<

-- Atomic quote-request to invoice conversion.
CREATE OR REPLACE FUNCTION public.convert_quote_request_to_invoice(
  p_request_id uuid,
  p_client_id uuid,
  p_document_number text,
  p_issue_date date,
  p_notes text,
  p_delivery_address_line_1 text,
  p_delivery_address_line_2 text,
  p_delivery_town text,
  p_delivery_county text,
  p_delivery_postcode text,
  p_subtotal numeric,
  p_vat_total numeric,
  p_total numeric,
  p_items jsonb,
  p_user_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request_status text;
  v_invoice_id uuid;
  v_item jsonb;
  v_sort_order int := 0;
  v_is_admin boolean;
  v_client_created_by uuid;
  v_operator_name text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT public.is_admin() INTO v_is_admin;

  IF auth.uid() <> p_user_id AND NOT v_is_admin THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF NOT v_is_admin AND NOT public.has_staff_permission('quote_requests_convert') THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  -- Look up the operator name from the profile of the user performing the conversion
  SELECT COALESCE(full_name, NULLIF(TRIM(CONCAT_WS(' ', first_name, last_name)), ''), 'Unknown Operator')
    INTO v_operator_name
    FROM public.profiles
   WHERE id = p_user_id;

  SELECT created_by INTO v_client_created_by
    FROM public.clients
   WHERE id = p_client_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Client not found.' USING ERRCODE = 'P0002';
  END IF;

  IF v_client_created_by <> p_user_id AND NOT v_is_admin THEN
    RAISE EXCEPTION 'Not authorized to use this client.' USING ERRCODE = '42501';
  END IF;

  SELECT status INTO v_request_status
    FROM public.quote_requests
   WHERE id = p_request_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quote request not found.' USING ERRCODE = 'P0002';
  END IF;

  IF v_request_status = 'invoiced' THEN
    RAISE EXCEPTION 'This quote request has already been converted to an invoice.' USING ERRCODE = 'P0001';
  END IF;

  IF v_request_status IN ('rejected', 'cancelled') THEN
    RAISE EXCEPTION 'Request is % and cannot be converted.', v_request_status USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.invoices (
    type, document_number, client_id, status, issue_date, notes, operator_name,
    delivery_address_line_1, delivery_address_line_2, delivery_town, delivery_county,
    delivery_postcode, subtotal, vat_total, total, amount_paid, created_by,
    share_token, public_share_enabled, share_token_expires_at
  ) VALUES (
    'quotation', p_document_number, p_client_id, 'draft', p_issue_date,
    NULLIF(p_notes, ''), v_operator_name,
    NULLIF(p_delivery_address_line_1, ''), NULLIF(p_delivery_address_line_2, ''),
    NULLIF(p_delivery_town, ''), NULLIF(p_delivery_county, ''),
    NULLIF(UPPER(p_delivery_postcode), ''), p_subtotal, p_vat_total, p_total,
    0, p_user_id, gen_random_uuid(), true, now() + interval '7 days'
  )
  RETURNING id INTO v_invoice_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    INSERT INTO public.invoice_items (
      invoice_id, product_id, product_code, product_name, unit, quantity,
      price, line_total, vat_amount, vat_rate, sort_order
    ) VALUES (
      v_invoice_id,
      NULLIF(v_item->>'product_id', '')::uuid,
      NULLIF(v_item->>'product_code', ''),
      v_item->>'product_name',
      COALESCE(NULLIF(v_item->>'unit', ''), 'EA'),
      COALESCE((v_item->>'quantity')::numeric, 0),
      COALESCE((v_item->>'price')::numeric, 0),
      COALESCE((v_item->>'line_total')::numeric, 0),
      COALESCE((v_item->>'vat_amount')::numeric, 0),
      COALESCE((v_item->>'vat_rate')::numeric, 0),
      v_sort_order
    );
    v_sort_order := v_sort_order + 1;
  END LOOP;

  UPDATE public.quote_requests
     SET status = 'invoiced',
         processed_by = p_user_id,
         processed_at = now(),
         created_invoice_id = v_invoice_id
   WHERE id = p_request_id;

  RETURN v_invoice_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.convert_quote_request_to_invoice(
  uuid, uuid, text, date, text, text, text, text, text, text,
  numeric, numeric, numeric, jsonb, uuid
) TO authenticated;

-- >>>>> End supabase/migrations/073_convert_quote_request_to_invoice.sql <<<<<
-- >>>>> BEGIN supabase/migrations/074_security_hardening_rpc_and_team_trigger.sql <<<<<

-- 1. Tighten enforce_profile_update_scope so only administrators can change role.
CREATE OR REPLACE FUNCTION public.enforce_profile_update_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF NEW.client_id IS DISTINCT FROM OLD.client_id
     OR NEW.is_active IS DISTINCT FROM OLD.is_active THEN
    IF NOT public.is_admin() THEN
      RAISE EXCEPTION 'Only administrators can change client link or active status.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role THEN
    IF NOT public.is_admin() THEN
      RAISE EXCEPTION 'Only administrators can change role.'
        USING ERRCODE = '42501';
    END IF;
    IF NEW.role NOT IN ('admin', 'staff', 'client') OR OLD.role NOT IN ('admin', 'staff', 'client') THEN
      RAISE EXCEPTION 'Invalid role transition.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

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

DROP TRIGGER IF EXISTS profiles_enforce_update_scope ON public.profiles;
CREATE TRIGGER profiles_enforce_update_scope
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_profile_update_scope();

-- 2. Fix update_invoice_with_items so order_number and account_number are
--    preserved when omitted from the payload.
CREATE OR REPLACE FUNCTION public.update_invoice_with_items(
  p_invoice_id uuid,
  p_user_id uuid,
  p_payload jsonb
) RETURNS public.invoices
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing public.invoices;
  v_is_admin boolean;
  v_item jsonb;
  v_sort integer := 0;
BEGIN
  SELECT * INTO v_existing FROM public.invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT public.is_admin() INTO v_is_admin;
  IF v_existing.created_by <> auth.uid() AND NOT v_is_admin THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  UPDATE public.invoices SET
    client_id              = COALESCE(NULLIF(p_payload->>'client_id', '')::uuid, client_id),
    issue_date             = COALESCE(NULLIF(p_payload->>'issue_date', '')::date, issue_date),
    issue_time             = CASE
                              WHEN p_payload ? 'issue_time' THEN NULLIF(p_payload->>'issue_time', '')::time
                              ELSE issue_time
                            END,
    due_date               = NULLIF(p_payload->>'due_date', '')::date,
    expiry_date            = NULLIF(p_payload->>'expiry_date', '')::date,
    order_number           = CASE
                              WHEN p_payload ? 'order_number'
                                THEN NULLIF(p_payload->>'order_number', '')
                              ELSE order_number
                            END,
    account_number         = CASE
                              WHEN p_payload ? 'account_number'
                                THEN NULLIF(p_payload->>'account_number', '')
                              ELSE account_number
                            END,
    operator_name          = COALESCE(NULLIF(p_payload->>'operator_name', ''), operator_name),
    your_reference         = NULLIF(p_payload->>'your_reference', ''),
    notes                  = NULLIF(p_payload->>'notes', ''),
show_payment_terms     = CASE
                               WHEN p_payload ? 'show_payment_terms'
                                 THEN COALESCE(NULLIF(p_payload->>'show_payment_terms', '')::boolean, show_payment_terms)
                               ELSE show_payment_terms
                             END,
    show_watermark         = CASE
                               WHEN p_payload ? 'show_watermark'
                                 THEN COALESCE(NULLIF(p_payload->>'show_watermark', '')::boolean, show_watermark)
                               ELSE show_watermark
                             END,
    show_paid_watermark    = CASE
                               WHEN p_payload ? 'show_paid_watermark'
                                 THEN COALESCE(NULLIF(p_payload->>'show_paid_watermark', '')::boolean, show_paid_watermark)
                               ELSE show_paid_watermark
                             END,
    show_partially_paid_watermark = CASE
                               WHEN p_payload ? 'show_partially_paid_watermark'
                                 THEN COALESCE(NULLIF(p_payload->>'show_partially_paid_watermark', '')::boolean, show_partially_paid_watermark)
                               ELSE show_partially_paid_watermark
                             END,
    show_overdue_watermark = CASE
                               WHEN p_payload ? 'show_overdue_watermark'
                                 THEN COALESCE(NULLIF(p_payload->>'show_overdue_watermark', '')::boolean, show_overdue_watermark)
                               ELSE show_overdue_watermark
                             END,
    status                 = COALESCE(NULLIF(p_payload->>'status', ''), status),
    delivery_method        = COALESCE(NULLIF(p_payload->>'delivery_method', ''), delivery_method),
    delivery_address_line_1 = NULLIF(p_payload->>'delivery_address_line_1', ''),
    delivery_address_line_2 = NULLIF(p_payload->>'delivery_address_line_2', ''),
    delivery_town          = NULLIF(p_payload->>'delivery_town', ''),
    delivery_county        = NULLIF(p_payload->>'delivery_county', ''),
    delivery_postcode      = UPPER(NULLIF(p_payload->>'delivery_postcode', '')),
    subtotal               = (p_payload->>'subtotal')::numeric,
    vat_total              = (p_payload->>'vat_total')::numeric,
    total                  = (p_payload->>'total')::numeric,
    updated_at             = now()
  WHERE id = p_invoice_id;

  DELETE FROM public.invoice_items WHERE invoice_id = p_invoice_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_payload->'items', '[]'::jsonb))
  LOOP
    INSERT INTO public.invoice_items (
      invoice_id, product_id, product_name, product_code, unit,
      quantity, price, vat_rate, vat_amount, line_total, sort_order
    ) VALUES (
      p_invoice_id,
      NULLIF(v_item->>'product_id', '')::uuid,
      v_item->>'product_name',
      NULLIF(v_item->>'product_code', ''),
      COALESCE(NULLIF(v_item->>'unit', ''), 'EA'),
      (v_item->>'quantity')::numeric,
      (v_item->>'price')::numeric,
      (v_item->>'vat_rate')::numeric,
      (v_item->>'vat_amount')::numeric,
      (v_item->>'line_total')::numeric,
      v_sort
    );
    v_sort := v_sort + 1;
  END LOOP;

  RETURN (SELECT * FROM public.invoices WHERE id = p_invoice_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_invoice_with_items(uuid, uuid, jsonb) TO authenticated;

-- >>>>> End supabase/migrations/074_security_hardening_rpc_and_team_trigger.sql <<<<<


-- >>>>> BEGIN supabase/migrations/076_deep_dive_fixes.sql <<<<<

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
-- <<<<< END supabase/migrations/076_deep_dive_fixes.sql <<<<<


-- >>>>> BEGIN supabase/migrations/081_recreate_update_invoice_rpc_return_type.sql <<<<<

-- Migration 081: recreate update_invoice_with_items to refresh its return type.
--
-- Migration 079 added the show_payment_terms column to public.invoices and
-- migration 080 updated the RPC to persist it. On some database states the
-- existing function still references the pre-alteration composite type, so
-- `RETURN (SELECT * FROM public.invoices WHERE id = p_invoice_id)` fails with
-- SQLSTATE 42601 "subquery must return only one column" when the function's
-- stale return type no longer matches the current table row.
--
-- Dropping and recreating the function guarantees its return type is rebuilt
-- against the current invoices row type, which resolves the save failure when
-- toggling VAT or Show payment terms on existing documents.

DROP FUNCTION IF EXISTS public.update_invoice_with_items(uuid, uuid, jsonb);

CREATE FUNCTION public.update_invoice_with_items(
  p_invoice_id uuid,
  p_user_id uuid,
  p_payload jsonb
) RETURNS public.invoices
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing public.invoices;
  v_is_admin boolean;
  v_item jsonb;
  v_sort integer := 0;
BEGIN
  SELECT * INTO v_existing FROM public.invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT public.is_admin() INTO v_is_admin;
  IF v_existing.created_by <> auth.uid() AND NOT v_is_admin THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  UPDATE public.invoices SET
    client_id              = COALESCE(NULLIF(p_payload->>'client_id', '')::uuid, client_id),
    issue_date             = COALESCE(NULLIF(p_payload->>'issue_date', '')::date, issue_date),
    issue_time             = CASE
                              WHEN p_payload ? 'issue_time' THEN NULLIF(p_payload->>'issue_time', '')::time
                              ELSE issue_time
                            END,
    due_date               = NULLIF(p_payload->>'due_date', '')::date,
    expiry_date            = NULLIF(p_payload->>'expiry_date', '')::date,
    order_number           = CASE
                              WHEN p_payload ? 'order_number'
                                THEN NULLIF(p_payload->>'order_number', '')
                              ELSE order_number
                            END,
    account_number         = CASE
                              WHEN p_payload ? 'account_number'
                                THEN NULLIF(p_payload->>'account_number', '')
                              ELSE account_number
                            END,
    operator_name          = COALESCE(NULLIF(p_payload->>'operator_name', ''), operator_name),
    your_reference         = NULLIF(p_payload->>'your_reference', ''),
    notes                  = NULLIF(p_payload->>'notes', ''),
show_payment_terms     = CASE
                               WHEN p_payload ? 'show_payment_terms'
                                 THEN COALESCE(NULLIF(p_payload->>'show_payment_terms', '')::boolean, show_payment_terms)
                               ELSE show_payment_terms
                             END,
    show_watermark         = CASE
                               WHEN p_payload ? 'show_watermark'
                                 THEN COALESCE(NULLIF(p_payload->>'show_watermark', '')::boolean, show_watermark)
                               ELSE show_watermark
                             END,
    show_paid_watermark    = CASE
                               WHEN p_payload ? 'show_paid_watermark'
                                 THEN COALESCE(NULLIF(p_payload->>'show_paid_watermark', '')::boolean, show_paid_watermark)
                               ELSE show_paid_watermark
                             END,
    show_partially_paid_watermark = CASE
                               WHEN p_payload ? 'show_partially_paid_watermark'
                                 THEN COALESCE(NULLIF(p_payload->>'show_partially_paid_watermark', '')::boolean, show_partially_paid_watermark)
                               ELSE show_partially_paid_watermark
                             END,
    show_overdue_watermark = CASE
                               WHEN p_payload ? 'show_overdue_watermark'
                                 THEN COALESCE(NULLIF(p_payload->>'show_overdue_watermark', '')::boolean, show_overdue_watermark)
                               ELSE show_overdue_watermark
                             END,
    status                 = COALESCE(NULLIF(p_payload->>'status', ''), status),
    delivery_method        = COALESCE(NULLIF(p_payload->>'delivery_method', ''), delivery_method),
    delivery_address_line_1 = NULLIF(p_payload->>'delivery_address_line_1', ''),
    delivery_address_line_2 = NULLIF(p_payload->>'delivery_address_line_2', ''),
    delivery_town          = NULLIF(p_payload->>'delivery_town', ''),
    delivery_county        = NULLIF(p_payload->>'delivery_county', ''),
    delivery_postcode      = UPPER(NULLIF(p_payload->>'delivery_postcode', '')),
    subtotal               = (p_payload->>'subtotal')::numeric,
    vat_total              = (p_payload->>'vat_total')::numeric,
    total                  = (p_payload->>'total')::numeric,
    updated_at             = now()
  WHERE id = p_invoice_id;

  DELETE FROM public.invoice_items WHERE invoice_id = p_invoice_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_payload->'items', '[]'::jsonb))
  LOOP
    INSERT INTO public.invoice_items (
      invoice_id, product_id, product_name, product_code, unit,
      quantity, price, vat_rate, vat_amount, line_total, sort_order
    ) VALUES (
      p_invoice_id,
      NULLIF(v_item->>'product_id', '')::uuid,
      v_item->>'product_name',
      NULLIF(v_item->>'product_code', ''),
      COALESCE(NULLIF(v_item->>'unit', ''), 'EA'),
      (v_item->>'quantity')::numeric,
      (v_item->>'price')::numeric,
      (v_item->>'vat_rate')::numeric,
      (v_item->>'vat_amount')::numeric,
      (v_item->>'line_total')::numeric,
      v_sort
    );
    v_sort := v_sort + 1;
  END LOOP;

  RETURN (SELECT * FROM public.invoices WHERE id = p_invoice_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_invoice_with_items(uuid, uuid, jsonb) TO authenticated;

-- <<<<< END supabase/migrations/081_recreate_update_invoice_rpc_return_type.sql <<<<<


-- =============================================================================
-- 065_search_products_exclude_temporary.sql — appended to consolidated schema
-- =============================================================================
-- Adds the p_exclude_temporary parameter so temp products do not leak to the
-- public catalogue or dashboard product list. This section was missing from the
-- consolidated schema.sql; including it here makes the subsequent EXECUTE grant
-- for search_products(text, integer, boolean, boolean) valid.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.search_products(
  p_query text,
  p_limit integer DEFAULT 20,
  p_active_only boolean DEFAULT true,
  p_exclude_temporary boolean DEFAULT true
)
RETURNS SETOF public.products
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_query text := trim(coalesce(p_query, ''));
  v_fts_query tsquery;
  v_temp_filter text := CASE WHEN p_exclude_temporary
    THEN ' AND NOT p.is_temporary'
    ELSE '' END;
BEGIN
  IF v_query = '' THEN
    RETURN QUERY EXECUTE
      'SELECT p.* FROM public.products p
       WHERE (NOT $1 OR p.is_active = true)' || v_temp_filter || '
       ORDER BY p.name
       LIMIT $2'
      USING p_active_only, p_limit;
    RETURN;
  END IF;

  v_fts_query := websearch_to_tsquery('english', v_query);

  CREATE TEMP TABLE IF NOT EXISTS _search_product_results (
    id uuid PRIMARY KEY,
    stage int NOT NULL,
    score numeric NOT NULL
  ) ON COMMIT DROP;

  TRUNCATE _search_product_results;

  EXECUTE '
    INSERT INTO _search_product_results (id, stage, score)
    SELECT p.id, 1, ts_rank_cd(p.search_document, $1, 32)
    FROM public.products p
    WHERE (NOT $2 OR p.is_active = true)' || v_temp_filter || '
      AND p.search_document @@ $1
    ON CONFLICT (id) DO NOTHING'
    USING v_fts_query, p_active_only;

  EXECUTE '
    INSERT INTO _search_product_results (id, stage, score)
    SELECT p.id, 2, greatest(
      similarity(p.name, $1),
      similarity(p.code, $1),
      similarity(p.category, $1),
      similarity(p.brand, $1),
      similarity(coalesce(public.array_to_text(p.search_tags), ''''), $1),
      similarity(p.description, $1)
    )
    FROM public.products p
    WHERE (NOT $2 OR p.is_active = true)' || v_temp_filter || '
      AND NOT EXISTS (SELECT 1 FROM _search_product_results r WHERE r.id = p.id)
      AND (
        similarity(p.name, $1) > 0.18
        OR similarity(p.code, $1) > 0.18
        OR similarity(p.category, $1) > 0.18
        OR similarity(p.brand, $1) > 0.18
        OR similarity(coalesce(public.array_to_text(p.search_tags), ''''), $1) > 0.18
        OR similarity(p.description, $1) > 0.18
      )
    ON CONFLICT (id) DO NOTHING'
    USING v_query, p_active_only;

  EXECUTE '
    INSERT INTO _search_product_results (id, stage, score)
    SELECT p.id, 3, 0.0
    FROM public.products p
    WHERE (NOT $2 OR p.is_active = true)' || v_temp_filter || '
      AND NOT EXISTS (SELECT 1 FROM _search_product_results r WHERE r.id = p.id)
      AND (
        p.name ILIKE ''%'' || $1 || ''%''
        OR p.code ILIKE ''%'' || $1 || ''%''
        OR coalesce(public.array_to_text(p.search_tags), '''') ILIKE ''%'' || $1 || ''%''
        OR p.description ILIKE ''%'' || $1 || ''%''
      )
    ON CONFLICT (id) DO NOTHING'
    USING v_query, p_active_only;

  RETURN QUERY
    SELECT p.*
    FROM public.products p
    JOIN _search_product_results r ON r.id = p.id
    ORDER BY r.stage, r.score DESC, p.name
    LIMIT p_limit;
END;
$$;

-- =============================================================================
-- 066_drop_old_search_products_overload.sql — appended to consolidated schema
-- =============================================================================
-- Remove the 3-argument overload so all callers bind to the 4-argument version.
-- =============================================================================

DROP FUNCTION IF EXISTS public.search_products(p_query text, p_limit integer, p_active_only boolean);


-- =============================================================================
-- Backfill: public.is_own_client() (from 057_client_tools.sql)
-- =============================================================================
-- The consolidated schema.sql was missing this helper. It is required by
-- client_inventory / client_quotes RLS policies and by the EXECUTE grants below.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.is_own_client(p_client_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.profiles p
     WHERE p.id = auth.uid()
       AND p.role = 'client'
       AND p.client_id = p_client_id
  );
$$;


-- =============================================================================
-- Consolidated function EXECUTE grants
-- =============================================================================
-- Postgres grants EXECUTE on new functions to PUBLIC by default. The statements
-- below lock down the SECURITY DEFINER functions that are exposed through the
-- Supabase REST API so that only the roles the application actually uses can
-- call them. This section mirrors supabase/migrations/091_security_advisor_followup.sql.

-- Revoke default PUBLIC execute on flagged SECURITY DEFINER functions.
REVOKE EXECUTE ON FUNCTION public.check_rate_limit(text, integer, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cleanup_stale_quote_requests() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_profile_update_scope() FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.generate_document_number(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.generate_unique_order_number() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_staff_permission(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_client_of_invoice(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_own_client(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.replace_company_contact_channels(integer, jsonb, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.search_products(text, integer, boolean, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_invoice_with_items(uuid, uuid, jsonb) FROM PUBLIC;

-- Public / authenticated surfaces
GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, integer, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_products(text, integer, boolean, boolean) TO anon, authenticated;

-- Authenticated dashboard surfaces
GRANT EXECUTE ON FUNCTION public.generate_document_number(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.generate_unique_order_number() TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_staff_permission(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_client_of_invoice(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_own_client(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.replace_company_contact_channels(integer, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_invoice_with_items(uuid, uuid, jsonb) TO authenticated;

-- Server-only cleanup function (Vercel cron uses service_role; pg_cron runs as
-- the table owner and does not need a role grant).
GRANT EXECUTE ON FUNCTION public.cleanup_stale_quote_requests() TO service_role;

-- enforce_profile_update_scope is trigger-only and needs no direct role grant.


-- >>>>> BEGIN supabase/migrations/092_invoice_sharing_password_and_opaque_key.sql >>>>>
-- Migration 092: Add password-protected sharing and opaque share keys.
--
-- 1. Adds public_share_key: a short, URL-safe, opaque token used in public
--    share links instead of the raw UUID share_token.
-- 2. Adds public_share_requires_password + public_share_password_hash so a
--    visitor needs both the link and a generated password to view the doc.
-- 3. Backfills keys for invoices that already have sharing enabled.

-- A. Add columns
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS public_share_key text,
  ADD COLUMN IF NOT EXISTS public_share_requires_password boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS public_share_password_hash text;

-- B. Backfill opaque keys for existing public links
UPDATE public.invoices
SET public_share_key = translate(encode(gen_random_bytes(12), 'base64'), '+/=', 'ABC')
WHERE public_share_enabled = true
  AND public_share_key IS NULL;

-- C. Indexes
CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_public_share_key_unique
  ON public.invoices(public_share_key)
  WHERE public_share_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_public_share_enabled_key
  ON public.invoices(public_share_key)
  WHERE public_share_enabled = true;
CREATE INDEX IF NOT EXISTS idx_invoices_delivery_note_share_enabled_key
  ON public.invoices(public_share_key)
  WHERE delivery_note_share_enabled = true AND public_share_key IS NOT NULL;

-- D. Comments
COMMENT ON COLUMN public.invoices.public_share_key IS
  'Opaque, URL-safe token used in public share links. Rotated when the link is regenerated.';

COMMENT ON COLUMN public.invoices.public_share_requires_password IS
  'When true, visitors must supply a password before the public page shows the invoice.';

COMMENT ON COLUMN public.invoices.public_share_password_hash IS
  'PBKDF2 hash of the auto-generated share password. Never returned to clients.';
-- <<<<< END supabase/migrations/092_invoice_sharing_password_and_opaque_key.sql <<<<<
