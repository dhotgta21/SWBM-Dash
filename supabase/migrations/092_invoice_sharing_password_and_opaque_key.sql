-- Migration 092: Add password-protected sharing and opaque share keys.
--
-- 1. Adds public_share_key: a short, URL-safe, opaque token used in public
--    share links instead of the raw UUID share_token.
-- 2. Adds public_share_requires_password + public_share_password_hash so a
--    visitor needs both the link and a generated password to view the doc.
-- 3. Backfills keys for invoices that already have sharing enabled.

-- ┌───────────────────────────────────────────────────────────────────────────┐
-- │ A. Add columns                                                            │
-- └───────────────────────────────────────────────────────────────────────────┘

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS public_share_key text,
  ADD COLUMN IF NOT EXISTS public_share_requires_password boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS public_share_password_hash text;

-- ┌───────────────────────────────────────────────────────────────────────────┐
-- │ B. Backfill opaque keys for existing public links                         │
-- └───────────────────────────────────────────────────────────────────────────┘

-- 12 random bytes = 16 base64 characters (no padding). We translate the two
-- non-URL-safe base64 characters and the padding char into URL-safe alphanumerics
-- so the key works in any browser/email client.
UPDATE public.invoices
SET public_share_key = translate(encode(gen_random_bytes(12), 'base64'), '+/=', 'ABC')
WHERE public_share_enabled = true
  AND public_share_key IS NULL;

-- ┌───────────────────────────────────────────────────────────────────────────┐
-- │ C. Indexes                                                                │
-- └───────────────────────────────────────────────────────────────────────────┘

-- Unique where not null: many rows may have no public key.
CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_public_share_key_unique
  ON public.invoices(public_share_key)
  WHERE public_share_key IS NOT NULL;

-- Fast lookup of active public links by key.
CREATE INDEX IF NOT EXISTS idx_invoices_public_share_enabled_key
  ON public.invoices(public_share_key)
  WHERE public_share_enabled = true;

-- ┌───────────────────────────────────────────────────────────────────────────┐
-- │ D. Comments                                                               │
-- └───────────────────────────────────────────────────────────────────────────┘

COMMENT ON COLUMN public.invoices.public_share_key IS
  'Opaque, URL-safe token used in public share links. Rotated when the link is regenerated.';

COMMENT ON COLUMN public.invoices.public_share_requires_password IS
  'When true, visitors must supply a password before the public page shows the invoice.';

COMMENT ON COLUMN public.invoices.public_share_password_hash IS
  'PBKDF2 hash of the auto-generated share password. Never returned to clients.';
