-- =============================================================================
-- Star Hawk Builders Merchant — 067_invoice_assistant_api_key.sql
-- =============================================================================
-- Adds secret storage for the AI Invoice Assistant (DeepSeek).
--
-- The API key is stored AES-256-GCM encrypted (ciphertext + IV + salt + auth
-- tag, base64url colon-delimited) using AI_DESIGNER_KEY_ENCRYPTION_KEY from the
-- environment. The plaintext key never touches the database.
--
-- Access model:
--   * Only the service_role can read or write the row.
--   * No client-facing RLS policies are created — anon and authenticated
--     roles cannot SELECT, INSERT, UPDATE or DELETE.
--   * The settings page talks to the table through server actions that
--     use the admin client.
--
-- The single-row pattern (id=1) matches ai_designer_api_key from the old
-- migration 059, which the codebase has already used elsewhere.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. invoice_assistant_api_key — single-row secret store
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.invoice_assistant_api_key (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  -- AES-256-GCM ciphertext blob: "salt:iv:authTag:ciphertext" all base64url.
  deepseek_api_key_encrypted text,
  -- Optional model override. Falls back to DEEPSEEK_MODEL or the hard-coded
  -- default when null.
  deepseek_model text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE SET NULL
);

COMMENT ON TABLE public.invoice_assistant_api_key IS
  'Single-row secret storage for the AI Invoice Assistant (DeepSeek). Readable only by the service role; the key is stored AES-256-GCM encrypted.';
COMMENT ON COLUMN public.invoice_assistant_api_key.deepseek_api_key_encrypted IS
  'AES-256-GCM ciphertext of the DeepSeek API key. Format: base64url(salt):base64url(iv):base64url(authTag):base64url(ciphertext).';
COMMENT ON COLUMN public.invoice_assistant_api_key.deepseek_model IS
  'Optional DeepSeek model override (e.g. deepseek-v4-flash, deepseek-v4-pro). Empty falls back to DEEPSEEK_MODEL or the default.';

INSERT INTO public.invoice_assistant_api_key (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 2. updated_at trigger
-- -----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_invoice_assistant_api_key_updated_at ON public.invoice_assistant_api_key;
CREATE TRIGGER trg_invoice_assistant_api_key_updated_at
  BEFORE UPDATE ON public.invoice_assistant_api_key
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- -----------------------------------------------------------------------------
-- 3. Row Level Security — service_role only
-- -----------------------------------------------------------------------------
ALTER TABLE public.invoice_assistant_api_key ENABLE ROW LEVEL SECURITY;

-- No policies are created for anon or authenticated: those roles get no
-- implicit access to the row. The service_role bypasses RLS so it can read
-- the encrypted key on every assistant turn.

-- -----------------------------------------------------------------------------
-- 4. Grants — service_role needs explicit table-level grants even with RLS
--    bypassed because PostgREST / direct queries still respect GRANTs.
-- -----------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoice_assistant_api_key TO service_role;