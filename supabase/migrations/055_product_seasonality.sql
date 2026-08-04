-- Migration 055: Product seasonality sale.
-- Adds the columns needed to schedule a temporary discounted price on a
-- product. The sale is "live" only when sale_starts_at <= now <=
-- sale_ends_at and the product is active. Outside that window (or when
-- sale_price is null) the normal default_price applies.
--
-- Design notes:
--   • sale_price is stored separately from default_price so the historical
--     pre-sale price is never lost — analytics, invoices and PDFs can still
--     quote the canonical price after the sale ends.
--   • sale_starts_at / sale_ends_at are nullable timestamptz. NULL means
--     "no sale scheduled". A product with a sale_price but no dates is
--     treated as "permanently on sale" (an open-ended clearance).
--   • sale_label is a free-text tag shown next to the price ("Winter Sale",
--     "Clearance", "Summer Bundle" etc.) so staff and the public shop can
--     surface a recognisable campaign name.
--   • The dashboard "Seasonal sales" widget reads these columns to show
--     live promotions, total revenue at risk, and how long each sale has
--     left to run.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS sale_price numeric(12, 2),
  ADD COLUMN IF NOT EXISTS sale_starts_at timestamptz,
  ADD COLUMN IF NOT EXISTS sale_ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS sale_label text;

COMMENT ON COLUMN public.products.sale_price IS
  'Discounted price during a scheduled sale. null = no sale active. Always stored separately from default_price so the pre-sale price is preserved.';

COMMENT ON COLUMN public.products.sale_starts_at IS
  'When the sale becomes active. null + sale_price set = permanent / clearance. sale_starts_at > sale_ends_at is treated as no sale.';

COMMENT ON COLUMN public.products.sale_ends_at IS
  'When the sale expires. null = no scheduled end. Once now() > sale_ends_at the sale is no longer applied to prices.';

COMMENT ON COLUMN public.products.sale_label IS
  'Free-text campaign name shown next to the sale price (e.g. "Winter Sale", "Clearance"). null = no label.';

-- Sanity constraint: a sale_price above the regular price is almost
-- always a data-entry mistake (the operator meant to lower it). We
-- refuse it at the DB layer so the bad value can't sneak in via a
-- direct UPDATE. The product form already warns the user before
-- submit; this is defence in depth.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'products_sale_price_below_default'
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_sale_price_below_default
      CHECK (
        sale_price IS NULL
        OR default_price IS NULL
        OR sale_price <= default_price
      );
  END IF;
END
$$;