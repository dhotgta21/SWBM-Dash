-- =============================================================================
-- DEMO: company address, contact, VAT/reg, reply-to, bank details, channels
-- Safe to re-run. Fills Settings → Company for invoice PDFs and public pages.
-- =============================================================================

-- Ensure core columns exist on partial schemas
ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS address_line_1 text,
  ADD COLUMN IF NOT EXISTS address_line_2 text,
  ADD COLUMN IF NOT EXISTS town text,
  ADD COLUMN IF NOT EXISTS county text,
  ADD COLUMN IF NOT EXISTS postcode text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS vat_number text,
  ADD COLUMN IF NOT EXISTS company_registration_number text,
  ADD COLUMN IF NOT EXISTS email_from_name text,
  ADD COLUMN IF NOT EXISTS email_reply_to text,
  ADD COLUMN IF NOT EXISTS website text,
  ADD COLUMN IF NOT EXISTS default_vat_rate numeric(5,2) DEFAULT 20;

-- Ensure bank table exists (partial schemas)
CREATE TABLE IF NOT EXISTS public.company_bank_details (
  id integer PRIMARY KEY DEFAULT 1,
  bank_name text,
  bank_account_name text,
  sort_code text,
  account_number text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  CONSTRAINT company_bank_single_row CHECK (id = 1)
);

INSERT INTO public.company_settings (id, company_name)
VALUES (1, 'Demo Builder Merchant')
ON CONFLICT (id) DO NOTHING;

UPDATE public.company_settings
   SET company_name = COALESCE(NULLIF(trim(company_name), ''), 'Demo Builder Merchant'),
       email_from_name = COALESCE(NULLIF(trim(email_from_name), ''), 'Demo Builder Merchant'),
       address_line_1 = '123 Trade Yard Road',
       address_line_2 = 'Industrial Estate',
       town = 'Birmingham',
       county = 'West Midlands',
       postcode = 'B12 3AB',
       phone = '0121 496 0000',
       email = 'hello@demo-builder.com',
       email_reply_to = 'accounts@demo-builder.com',
       vat_number = 'GB 123 4567 89',
       company_registration_number = '12345678',
       website = COALESCE(website, 'https://demo-builder.example'),
       default_vat_rate = COALESCE(default_vat_rate, 20),
       updated_at = now()
 WHERE id = 1;

INSERT INTO public.company_bank_details (id, bank_name, bank_account_name, sort_code, account_number)
VALUES (1, 'Demo National Bank', 'Demo Builder Merchant Ltd', '12-34-56', '12345678')
ON CONFLICT (id) DO UPDATE
   SET bank_name = EXCLUDED.bank_name,
       bank_account_name = EXCLUDED.bank_account_name,
       sort_code = EXCLUDED.sort_code,
       account_number = EXCLUDED.account_number,
       updated_at = now();

-- Channel tables (if present from multi-channel migrations)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'company_phones'
  ) THEN
    DELETE FROM public.company_phones WHERE settings_id = 1;
    INSERT INTO public.company_phones (
      settings_id, value, label, is_primary,
      show_header, show_homepage, show_contact_page, show_footer,
      show_invoice, show_email, show_auth, sort_order
    ) VALUES (
      1, '0121 496 0000', 'Sales', true,
      true, true, true, true,
      true, true, true, 0
    );
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'company_emails'
  ) THEN
    DELETE FROM public.company_emails WHERE settings_id = 1;
    INSERT INTO public.company_emails (
      settings_id, value, label, is_primary,
      show_header, show_homepage, show_contact_page, show_footer,
      show_invoice, show_email, show_auth, sort_order
    ) VALUES
      (1, 'hello@demo-builder.com', 'General', true,
       true, true, true, true, true, true, true, 0),
      (1, 'accounts@demo-builder.com', 'Accounts', false,
       false, false, true, true, true, true, false, 1);
  END IF;
END $$;

SELECT
  company_name, address_line_1, town, postcode, phone, email,
  email_reply_to, vat_number, company_registration_number
FROM public.company_settings WHERE id = 1;

SELECT bank_name, bank_account_name, sort_code, account_number
FROM public.company_bank_details WHERE id = 1;
