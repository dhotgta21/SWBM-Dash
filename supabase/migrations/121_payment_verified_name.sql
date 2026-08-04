-- =============================================================================
-- 121_payment_verified_name.sql
--
-- Adds an optional operator "signature" to payments so every money movement
-- (direct cash/bank/card payments on the invoice screen, not just wallet
-- allocations) can record the verified name of the operator who confirmed it.
--
-- The signature is captured by the confirmation dialog (operator login password
-- + name, with whitespace normalised to underscores) and stored here for audit.
-- Wallet (source='client_account') payments also carry the signature on the
-- client_account_transactions ledger row; this column is the equivalent for
-- direct payments.
-- =============================================================================

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS verified_name text;

COMMENT ON COLUMN public.payments.verified_name IS
  'Operator signature captured at payment time (login-password re-verified). Whitespace normalised to underscores; case preserved.';
