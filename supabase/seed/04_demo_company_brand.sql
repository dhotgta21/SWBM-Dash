-- =============================================================================
-- DEMO: force company name + logo wordmark to Demo Builder Merchant
-- =============================================================================
-- Run anytime in SQL Editor to wipe remaining Star Hawk branding from
-- company_settings (navbar/dashboard/invoices load this row).
-- =============================================================================

UPDATE public.company_settings
   SET company_name = 'Demo Builder Merchant',
       email_from_name = 'Demo Builder Merchant',
       logo_text_enabled = true,
       logo_text_primary = 'DEMO BUILDER',
       logo_text_secondary = 'MERCHANT',
       logo_url = '/Logo.webp',
       updated_at = now()
 WHERE id = 1;

-- If row missing, insert minimal demo company
INSERT INTO public.company_settings (id, company_name, email_from_name)
VALUES (1, 'Demo Builder Merchant', 'Demo Builder Merchant')
ON CONFLICT (id) DO NOTHING;

UPDATE public.company_settings
   SET company_name = 'Demo Builder Merchant',
       email_from_name = COALESCE(NULLIF(email_from_name, ''), 'Demo Builder Merchant'),
       logo_text_enabled = true,
       logo_text_primary = COALESCE(logo_text_primary, 'DEMO BUILDER'),
       logo_text_secondary = COALESCE(logo_text_secondary, 'MERCHANT'),
       logo_url = COALESCE(logo_url, '/Logo.webp'),
       updated_at = now()
 WHERE id = 1;

SELECT id, company_name, email_from_name, logo_text_primary, logo_text_secondary, logo_url
  FROM public.company_settings
 WHERE id = 1;
