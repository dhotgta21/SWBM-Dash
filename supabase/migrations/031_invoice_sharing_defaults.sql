-- Backfill any invoices that were created before public sharing columns had
-- sensible defaults, then make sure the defaults are locked in going forward.
-- This fixes cases where the public link or print/download via share token
-- returns "Invoice not found" because public_share_enabled is NULL/false or
-- share_token is missing.

-- Fill missing share tokens.
UPDATE public.invoices
   SET share_token = gen_random_uuid()
 WHERE share_token IS NULL;

-- Turn public sharing on for any rows where it was left unset.
UPDATE public.invoices
   SET public_share_enabled = true
 WHERE public_share_enabled IS NULL;

-- Ensure new rows default to publicly shareable.
ALTER TABLE public.invoices
  ALTER COLUMN public_share_enabled SET DEFAULT true;

-- The column is meant to be NOT NULL; enforce it now that nulls are gone.
ALTER TABLE public.invoices
  ALTER COLUMN public_share_enabled SET NOT NULL;
