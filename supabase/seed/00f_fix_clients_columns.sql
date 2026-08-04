-- One-shot: clients soft-delete + temporary + wallet columns missing on partial demo schemas.
-- Safe to re-run (IF NOT EXISTS). Fixes Clients page "0 accounts", Client Dashboard all-zero KPIs,
-- and Top debtors showing "Unknown client" (admin filters require deleted_at / is_temporary).
--
-- Run in Supabase SQL Editor against the demo project, then hard-refresh the app.
-- Also applied by scripts/apply-00f-clients.mjs when POSTGRES_URL_NON_POOLING is set.

-- Soft-delete (migration 093 family)
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_clients_deleted_at
  ON public.clients(deleted_at) WHERE deleted_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_clients_deleted_at_performed
  ON public.clients(deleted_at, updated_at) WHERE deleted_at IS NOT NULL;

-- Temporary walk-in clients (migration 064 family)
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS is_temporary boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS promoted_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_clients_is_temporary
  ON public.clients (is_temporary)
  WHERE is_temporary = true;

COMMENT ON COLUMN public.clients.is_temporary IS
  'True for walk-in / quick-add clients pending promotion to full accounts.';
COMMENT ON COLUMN public.clients.promoted_at IS
  'When a temporary client was promoted to permanent. Null for never-temporary rows.';

-- Wallet / account balance (migration 106 family)
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS account_balance numeric(12,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.clients.account_balance IS
  'Credit available to spend on invoices (client account wallet).';

-- Invoice / line discounts (migration 101) — required by /api/invoices/pdf select
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS discount_amount numeric(12,2),
  ADD COLUMN IF NOT EXISTS discount_percent numeric(5,2);

ALTER TABLE public.invoice_items
  ADD COLUMN IF NOT EXISTS discount_amount numeric(12,2),
  ADD COLUMN IF NOT EXISTS discount_percent numeric(5,2);

-- Smoke checks
SELECT
  (SELECT count(*) FROM public.clients) AS clients_total,
  (SELECT count(*) FROM public.clients WHERE deleted_at IS NULL AND coalesce(is_temporary, false) = false) AS permanent_accounts,
  (SELECT count(*) FROM public.clients WHERE is_temporary = true AND deleted_at IS NULL) AS temporary_clients;
