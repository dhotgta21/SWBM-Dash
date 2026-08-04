-- Add optional expiry timestamp to invoice share links.
-- Existing shared invoices get a 7-day grace period so current links
-- don't break immediately on deploy.

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS share_token_expires_at timestamptz;

UPDATE public.invoices
   SET share_token_expires_at = now() + interval '7 days'
 WHERE public_share_enabled = true
   AND share_token_expires_at IS NULL;
