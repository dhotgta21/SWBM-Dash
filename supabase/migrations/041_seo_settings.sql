-- Migration 041: SEO settings on company_settings
-- Adds editable SEO fields to the single-row company_settings table so
-- staff can manage home-page and quote-section metadata from Settings.

ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS seo_home_title text,
  ADD COLUMN IF NOT EXISTS seo_home_description text,
  ADD COLUMN IF NOT EXISTS seo_home_keywords text,
  ADD COLUMN IF NOT EXISTS seo_og_title text,
  ADD COLUMN IF NOT EXISTS seo_og_description text,
  ADD COLUMN IF NOT EXISTS seo_shop_title text,
  ADD COLUMN IF NOT EXISTS seo_shop_description text,
  ADD COLUMN IF NOT EXISTS seo_cart_title text,
  ADD COLUMN IF NOT EXISTS seo_cart_description text,
  ADD COLUMN IF NOT EXISTS seo_geo_latitude numeric,
  ADD COLUMN IF NOT EXISTS seo_geo_longitude numeric;

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
