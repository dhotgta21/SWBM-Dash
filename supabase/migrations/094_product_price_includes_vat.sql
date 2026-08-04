-- Migration 094: VAT-inclusive price flag.
-- Adds a boolean to record whether default_price + sale_price are
-- VAT-inclusive (true) or VAT-exclusive (false, the trade standard).
-- Public UI can then show an "inc. VAT" hint next to the price when set.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS price_includes_vat boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.products.price_includes_vat IS
  'True when the displayed default_price + sale_price already include VAT @ 20%. Default false (trade standard: VAT exclusive). Public PDP adds an "inc. VAT" hint when true.';