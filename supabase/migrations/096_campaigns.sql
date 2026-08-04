-- Campaigns: named groups of products with a shared percentage discount and schedule.
CREATE TABLE IF NOT EXISTS public.campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  discount_percent numeric(5,2) NOT NULL CHECK (discount_percent > 0 AND discount_percent <= 100),
  starts_at timestamptz,
  ends_at timestamptz,
  label text,
  is_paused boolean NOT NULL DEFAULT false,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.campaigns IS 'Product folders/groups used to apply a scheduled percentage discount to many products at once.';

CREATE INDEX IF NOT EXISTS idx_campaigns_dates ON public.campaigns(starts_at, ends_at, is_paused);

-- Join table linking campaigns to products.
CREATE TABLE IF NOT EXISTS public.campaign_products (
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (campaign_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_campaign_products_product_id ON public.campaign_products(product_id);

-- Soft-deleted campaigns should not participate in live discount resolution.
-- This is enforced in application code via deleted_at IS NULL checks.
COMMENT ON COLUMN public.campaigns.deleted_at IS 'Soft-delete timestamp; NULL means the campaign is active.';

-- Allow anonymous visitors to read active campaigns so public price resolution
-- can apply group discounts. Operators manage campaigns through authenticated
-- server actions; this policy is read-only for the public shop.
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_products ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'campaigns'
      AND policyname = 'campaigns_public_read'
  ) THEN
    CREATE POLICY campaigns_public_read
      ON public.campaigns
      FOR SELECT
      TO anon, authenticated
      USING (deleted_at IS NULL);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'campaign_products'
      AND policyname = 'campaign_products_public_read'
  ) THEN
    CREATE POLICY campaign_products_public_read
      ON public.campaign_products
      FOR SELECT
      TO anon, authenticated
      USING (true);
  END IF;
END
$$;
