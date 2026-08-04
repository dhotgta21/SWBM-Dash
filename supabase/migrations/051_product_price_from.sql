-- Migration 051: Add a public "price from" field to products.
-- This lets the site show a visible starting price (e.g. "From £24.50 per EA")
-- and emit a real price in Product JSON-LD / Google Shopping feeds while
-- keeping the quote-cart business model for volume/trade pricing.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS price_from numeric(12, 2);

COMMENT ON COLUMN public.products.price_from IS 'Visible starting price for the product. Used in on-page "From £X" display, Product schema Offer price, and Google Shopping feeds. Volume/trade pricing is still quoted on request.';
