-- =============================================================================
-- DEMO: force company name + logo wordmark to Demo Builder Merchant
-- =============================================================================
-- Works on partial schemas: adds logo_text_* / logo_url columns if missing,
-- then updates company_settings.
-- =============================================================================

-- Ensure branding columns exist (from later migrations not always applied)
ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS company_name text,
  ADD COLUMN IF NOT EXISTS email_from_name text,
  ADD COLUMN IF NOT EXISTS logo_url text,
  ADD COLUMN IF NOT EXISTS logo_text_enabled boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS logo_text_primary text,
  ADD COLUMN IF NOT EXISTS logo_text_secondary text,
  ADD COLUMN IF NOT EXISTS logo_text_layout text DEFAULT 'stacked',
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Ensure the single settings row exists
INSERT INTO public.company_settings (id, company_name)
VALUES (1, 'Demo Builder Merchant')
ON CONFLICT (id) DO NOTHING;

-- Force demo brand on the live row
UPDATE public.company_settings
   SET company_name = 'Demo Builder Merchant',
       email_from_name = 'Demo Builder Merchant',
       logo_text_enabled = true,
       logo_text_primary = 'DEMO BUILDER',
       logo_text_secondary = 'MERCHANT',
       logo_text_layout = COALESCE(logo_text_layout, 'stacked'),
       logo_url = '/Logo.webp',
       updated_at = now()
 WHERE id = 1;

SELECT id,
       company_name,
       email_from_name,
       logo_text_enabled,
       logo_text_primary,
       logo_text_secondary,
       logo_url
  FROM public.company_settings
 WHERE id = 1;
