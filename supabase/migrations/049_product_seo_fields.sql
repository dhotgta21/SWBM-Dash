-- Migration 049: Product-level SEO and structured-data fields
-- Adds per-product metadata so the 111 catalogue items can have unique
-- titles, descriptions and machine-readable facts instead of relying solely
-- on global templates.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS seo_title text,
  ADD COLUMN IF NOT EXISTS seo_description text,
  ADD COLUMN IF NOT EXISTS short_description text,
  ADD COLUMN IF NOT EXISTS key_features jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS brand text,
  ADD COLUMN IF NOT EXISTS mpn text,
  ADD COLUMN IF NOT EXISTS applications jsonb DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.products.seo_title IS 'Override for the product detail page <title>. Falls back to the global product title template.';
COMMENT ON COLUMN public.products.seo_description IS 'Override for the product detail page meta description. Falls back to the global product description template.';
COMMENT ON COLUMN public.products.short_description IS 'Short snippet used in product cards and social shares.';
COMMENT ON COLUMN public.products.key_features IS 'JSON array of feature strings, rendered visibly and as schema.org additionalProperty.';
COMMENT ON COLUMN public.products.brand IS 'Product brand (e.g. LBC, British Gypsum). Emitted as schema.org Brand.';
COMMENT ON COLUMN public.products.mpn IS 'Manufacturer part number. Optional; reduces Google Search Console warnings.';
COMMENT ON COLUMN public.products.applications IS 'JSON array of use-case strings, rendered visibly and as schema.org additionalProperty.';
