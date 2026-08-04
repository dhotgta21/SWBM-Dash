-- =============================================================================
-- 095. Quote requests — add 'kind' column to distinguish orders from quotes
-- =============================================================================
--
-- Why:
--   Customers on the public shop can now place a real order when every line
--   has a price — the operator will call to confirm and convert straight to an
--   invoice for payment. When any line is unpriced, the only valid action is
--   a "request a quote" so the operator can fill in the missing prices first.
--
--   Both flow through the same `quote_requests` table and the same operator
--   pipeline (pending → reviewed → invoiced). The only thing that differs is
--   how the operator interprets the row at first sight, and the document
--   number prefix the customer sees (OR-… for orders, QR-… for quotes).
--
-- Defaults:
--   Existing rows get `kind = 'quote'` so nothing in-flight changes meaning.
--   All new INSERTs from submitQuoteRequest pass an explicit `kind`; rows that
--   somehow land without one fall back to 'quote' via the column default.
--
-- Index:
--   The admin inbox filters by (status, kind). A composite index keeps that
--   query cheap as the table grows.
-- =============================================================================

ALTER TABLE public.quote_requests
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'quote'
    CHECK (kind IN ('quote', 'order'));

CREATE INDEX IF NOT EXISTS idx_quote_requests_status_kind_created
  ON public.quote_requests (status, kind, created_at DESC);
