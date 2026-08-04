-- One-shot: soft-delete columns for invoices/payments + product variant columns.
-- Safe to re-run (IF NOT EXISTS). Fixes Analytics "Unable to load dashboard data"
-- and product detail pages that fall back to leaner SELECTs without materials.
--
-- Run in Supabase SQL Editor against the demo project, then hard-refresh the app.

-- Soft-delete (migration 093 family)
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_invoices_deleted_at
  ON public.invoices(deleted_at) WHERE deleted_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payments_deleted_at
  ON public.payments(deleted_at) WHERE deleted_at IS NOT NULL;

-- Product variant pack (migration 070 family)
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS materials jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS variant_options jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS family_slug text,
  ADD COLUMN IF NOT EXISTS source_url text;

-- Smoke checks (expect no errors; counts are informational)
SELECT
  (SELECT count(*) FROM public.invoices) AS invoice_count,
  (SELECT count(*) FROM public.payments) AS payment_count,
  (SELECT count(*) FROM public.products WHERE is_active = true) AS active_products;
