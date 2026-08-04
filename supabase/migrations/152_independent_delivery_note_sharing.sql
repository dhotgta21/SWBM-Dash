-- Migration 152: Independent delivery-note share visibility and access control.
--
-- Until now a single public_share_enabled / public_share_requires_password
-- pair gated BOTH the invoice link and the delivery-note link (?mode=delivery-note).
-- The Share & Visibility UI presents separate tabs, so operators reasonably
-- expect those controls to apply only to the selected document.
--
-- This migration adds per-document columns for the delivery note while leaving
-- the existing invoice columns unchanged. Existing rows are backfilled so
-- currently-shared invoices keep both links working (previous behaviour).

-- ┌───────────────────────────────────────────────────────────────────────────┐
-- │ A. Add columns                                                            │
-- └───────────────────────────────────────────────────────────────────────────┘

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS delivery_note_share_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS delivery_note_share_requires_password boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS delivery_note_share_password_hash text;

-- ┌───────────────────────────────────────────────────────────────────────────┐
-- │ B. Backfill from invoice share settings (preserve prior joint behaviour)  │
-- └───────────────────────────────────────────────────────────────────────────┘

UPDATE public.invoices
SET
  delivery_note_share_enabled = public_share_enabled,
  delivery_note_share_requires_password = public_share_requires_password,
  delivery_note_share_password_hash = public_share_password_hash
WHERE public_share_enabled = true
  AND delivery_note_share_enabled = false
  AND delivery_note_share_password_hash IS NULL
  AND delivery_note_share_requires_password = false;

-- ┌───────────────────────────────────────────────────────────────────────────┐
-- │ C. Indexes                                                                │
-- └───────────────────────────────────────────────────────────────────────────┘

CREATE INDEX IF NOT EXISTS idx_invoices_delivery_note_share_enabled_key
  ON public.invoices(public_share_key)
  WHERE delivery_note_share_enabled = true AND public_share_key IS NOT NULL;

-- ┌───────────────────────────────────────────────────────────────────────────┐
-- │ D. Comments                                                               │
-- └───────────────────────────────────────────────────────────────────────────┘

COMMENT ON COLUMN public.invoices.public_share_enabled IS
  'When true, the invoice (priced) public share link is visible.';

COMMENT ON COLUMN public.invoices.public_share_requires_password IS
  'When true, visitors need a password for the invoice share link only.';

COMMENT ON COLUMN public.invoices.public_share_password_hash IS
  'PBKDF2 hash of the invoice share password. Never returned to clients.';

COMMENT ON COLUMN public.invoices.delivery_note_share_enabled IS
  'When true, the delivery-note public share link (?mode=delivery-note) is visible.';

COMMENT ON COLUMN public.invoices.delivery_note_share_requires_password IS
  'When true, visitors need a password for the delivery-note share link only.';

COMMENT ON COLUMN public.invoices.delivery_note_share_password_hash IS
  'PBKDF2 hash of the delivery-note share password. Never returned to clients.';
