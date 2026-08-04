-- =============================================================================
-- Star Hawk Builders Merchant — 100_integration_secrets_rotation_tracking.sql
-- =============================================================================
-- Adds per-secret rotation timestamps and a configurable warning threshold to
-- company_integration_secrets. Safe to run even if migration 099 was already
-- applied: every statement uses IF NOT EXISTS.
-- =============================================================================

ALTER TABLE public.company_integration_secrets
  ADD COLUMN IF NOT EXISTS resend_api_key_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS turnstile_secret_key_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS goaddress_token_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS rotation_warning_days integer NOT NULL DEFAULT 90;

COMMENT ON COLUMN public.company_integration_secrets.resend_api_key_updated_at IS
  'Timestamp of the last Resend API key save or clear. Used for rotation warnings.';
COMMENT ON COLUMN public.company_integration_secrets.turnstile_secret_key_updated_at IS
  'Timestamp of the last Turnstile secret key save or clear. Used for rotation warnings.';
COMMENT ON COLUMN public.company_integration_secrets.goaddress_token_updated_at IS
  'Timestamp of the last GoAddress token save or clear. Used for rotation warnings.';
COMMENT ON COLUMN public.company_integration_secrets.rotation_warning_days IS
  'Number of days after which a stored integration secret is flagged as needing rotation.';
