-- Migration 042: SEO sameAs (identity / social profiles) on company_settings
-- Adds an editable list of profile URLs that are emitted as the schema.org
-- LocalBusiness `sameAs` field. Google cross-checks these (Facebook,
-- Instagram, LinkedIn, Google Business Profile, etc.) as a local-SEO trust
-- signal. Stored as a single text field (newline- or comma-separated) to
-- match the existing `seo_home_keywords` pattern; parsed in the loader.

ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS seo_same_as text;

COMMENT ON COLUMN public.company_settings.seo_same_as IS 'Newline- or comma-separated list of profile URLs (Facebook, Instagram, LinkedIn, Google Business Profile) emitted as the LocalBusiness schema.org sameAs field.';
