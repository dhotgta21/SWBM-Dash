-- =============================================================================
-- FIX: products.deleted_at missing (homepage category load error)
-- =============================================================================
-- Error seen on landing page:
--   Unable to load categories: column products.deleted_at does not exist
--
-- Run this, then run 02_construction_products.sql if the grid still has 0 products.
-- =============================================================================

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- Public catalogue reads (homepage + shop)
DROP POLICY IF EXISTS products_select ON public.products;
CREATE POLICY products_select ON public.products
  FOR SELECT USING (true);

GRANT SELECT ON public.products TO anon;
GRANT SELECT ON public.products TO authenticated;

SELECT
  COUNT(*) AS total_products,
  COUNT(*) FILTER (WHERE COALESCE(is_active, true) AND category IS NOT NULL) AS active_with_category
FROM public.products;
