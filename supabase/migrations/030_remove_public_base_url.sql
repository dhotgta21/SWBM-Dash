-- =============================================================================
-- Star Hawk Builders Merchant — 030_remove_public_base_url.sql
-- =============================================================================
-- The public_base_url setting has been removed. Share links and invite links
-- now derive the canonical URL automatically from the request origin or from
-- the NEXT_PUBLIC_APP_URL env var. This migration drops the now-unused column
-- and its format CHECK constraint.
-- =============================================================================

ALTER TABLE public.company_settings
  DROP CONSTRAINT IF EXISTS company_settings_public_base_url_format;

ALTER TABLE public.company_settings
  DROP COLUMN IF EXISTS public_base_url;
