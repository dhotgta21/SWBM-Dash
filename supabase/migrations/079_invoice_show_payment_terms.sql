-- Migration 079: add optional payment-terms visibility flag to invoices.
--
-- The VAT switch already lets operators include/exclude VAT from a document.
-- This flag does the same for the "Payment Due: 30 days from date of invoice"
-- line, so the bottom of the invoice stays clean when payment terms are not
-- required (e.g. for quotations or cash-on-delivery invoices).
--
-- Default is FALSE for new documents, but any invoices already in the system
-- are backfilled to TRUE so existing customer-facing documents keep their
-- current appearance.

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS show_payment_terms boolean NOT NULL DEFAULT false;

UPDATE public.invoices
  SET show_payment_terms = true
  WHERE show_payment_terms = false;
