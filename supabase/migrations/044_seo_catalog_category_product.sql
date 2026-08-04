-- Migration 044: SEO catalog / category / product template fields + price range
-- Adds editable metadata for the catalogue page, plus title/description
-- templates for category and product detail pages so operators can
-- customise every indexable URL from Settings without a code deploy.
--
-- Template syntax: the loader substitutes `{category}`, `{product}`, and
-- `{site}` placeholders at render time. Empty templates fall back to
-- safe hardcoded defaults in lib/seo/company-seo.ts so old rows keep
-- working with sensible SEO copy.

ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS seo_catalog_title text,
  ADD COLUMN IF NOT EXISTS seo_catalog_description text,
  ADD COLUMN IF NOT EXISTS seo_category_title_template text,
  ADD COLUMN IF NOT EXISTS seo_category_description_template text,
  ADD COLUMN IF NOT EXISTS seo_product_title_template text,
  ADD COLUMN IF NOT EXISTS seo_product_description_template text,
  ADD COLUMN IF NOT EXISTS seo_price_range text;

COMMENT ON COLUMN public.company_settings.seo_catalog_title IS 'Override for /shop/catalog page title. Falls back to "Full product catalogue | {site}".';
COMMENT ON COLUMN public.company_settings.seo_catalog_description IS 'Override for /shop/catalog meta description.';
COMMENT ON COLUMN public.company_settings.seo_category_title_template IS 'Template for /shop/{slug} title. Supports {category} and {site} placeholders. Default: "{category} — trade prices & same-day delivery | {site}".';
COMMENT ON COLUMN public.company_settings.seo_category_description_template IS 'Template for /shop/{slug} description. Supports {category} and {site} placeholders.';
COMMENT ON COLUMN public.company_settings.seo_product_title_template IS 'Template for /shop/product/{code} title. Supports {product} and {site} placeholders. Default: "{product} — trade quote | {site}".';
COMMENT ON COLUMN public.company_settings.seo_product_description_template IS 'Template for /shop/product/{code} description. Supports {product}, {category}, and {site} placeholders.';
COMMENT ON COLUMN public.company_settings.seo_price_range IS 'Schema.org priceRange for the LocalBusiness structured data (e.g. "££"). Empty = omit.';