-- =============================================================================
-- Star Hawk Builders Merchant — 099_company_integration_secrets.sql
-- =============================================================================
-- Adds secret storage for third-party integrations that can be configured from
-- Settings → Integrations (Resend, Cloudflare Turnstile, GoAddress).
--
-- Secret values are stored AES-256-GCM encrypted (ciphertext + IV + salt + auth
-- tag, base64url colon-delimited) using ENCRYPTION_KEY from the environment,
-- with AI_DESIGNER_KEY_ENCRYPTION_KEY as a deprecated fallback. The plaintext
-- secret never touches the database.
--
-- Access model:
--   * Only the service_role can read or write the row.
--   * No client-facing RLS policies are created — anon and authenticated
--     roles cannot SELECT, INSERT, UPDATE or DELETE.
--   * The settings page talks to the table through server actions that use the
--     admin client.
--
-- The single-row pattern (id=1) matches invoice_assistant_api_key.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. company_integration_secrets — single-row secret store
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.company_integration_secrets (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  -- AES-256-GCM ciphertext blob: "salt:iv:authTag:ciphertext" all base64url.
  resend_api_key_encrypted text,
  -- Sender address for outbound email. Format: email@domain.com or Name <email@domain.com>.
  resend_from_address text,
  -- AES-256-GCM ciphertext blob for Cloudflare Turnstile secret key.
  turnstile_secret_key_encrypted text,
  -- Public Cloudflare Turnstile site key (not a secret, shipped to the browser).
  turnstile_site_key text,
  -- AES-256-GCM ciphertext blob for GoAddress bearer token.
  goaddress_token_encrypted text,
  -- Per-secret rotation timestamps. These only change when the corresponding
  -- encrypted secret is saved or cleared, so admins can see how old each key is.
  resend_api_key_updated_at timestamptz,
  turnstile_secret_key_updated_at timestamptz,
  goaddress_token_updated_at timestamptz,
  -- Number of days after which a stored secret is flagged as needing rotation.
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

-- -----------------------------------------------------------------------------
-- 2. updated_at trigger
-- -----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_company_integration_secrets_updated_at ON public.company_integration_secrets;
CREATE TRIGGER trg_company_integration_secrets_updated_at
  BEFORE UPDATE ON public.company_integration_secrets
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- -----------------------------------------------------------------------------
-- 3. Row Level Security — service_role only
-- -----------------------------------------------------------------------------
ALTER TABLE public.company_integration_secrets ENABLE ROW LEVEL SECURITY;

-- No policies are created for anon or authenticated: those roles get no
-- implicit access to the row. The service_role bypasses RLS so it can read
-- the encrypted secrets on every request that needs them.

-- -----------------------------------------------------------------------------
-- 4. Grants — service_role needs explicit table-level grants even with RLS
--    bypassed because PostgREST / direct queries still respect GRANTs.
-- -----------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_integration_secrets TO service_role;
