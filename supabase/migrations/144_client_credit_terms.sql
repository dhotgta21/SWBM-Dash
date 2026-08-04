-- 144_client_credit_terms.sql
-- Per-client credit terms: payment terms (days) + credit limit.
--
-- payment_terms_days drives the invoice due date (issue_date + N days).
-- NULL means the system default of 30 days applies.
--
-- credit_limit is the max outstanding balance (£) before the client's
-- ACCOUNT is flagged "Over limit" across the dashboard (clients list pill,
-- client detail warning, invoice detail banner). NULL means no limit.
-- Flagging is visual only — no invoice statuses change and nothing is
-- blocked.
--
-- Columns stay nullable at the DB level: legacy clients and rows created
-- via the quick-create / AI-assistant paths carry NULLs (treated as
-- 30 days / no limit) until a human completes the record through the
-- client form, where both fields are required.

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS payment_terms_days integer,
  ADD COLUMN IF NOT EXISTS credit_limit numeric(12,2);

COMMENT ON COLUMN public.clients.payment_terms_days IS
  'Days after issue date that invoices for this client fall due. NULL = system default (30).';
COMMENT ON COLUMN public.clients.credit_limit IS
  'Max outstanding balance (£) before the account is flagged over limit. NULL = no limit.';
