-- =============================================================================
-- FIX: products.deleted_at missing (homepage category load error)
-- =============================================================================
-- Error seen on landing page:
--   Unable to load categories: column products.deleted_at does not exist
--
-- Run this, then run 02_construction_products.sql if the grid still has 0 products.
-- =============================================================================

-- Prefer the fuller 00b_fix_products_columns_and_rls.sql when available.
-- This file remains as a minimal fallback for older runbooks.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS is_temporary boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

DROP POLICY IF EXISTS products_select ON public.products;
DROP POLICY IF EXISTS products_select_anon ON public.products;
DROP POLICY IF EXISTS products_select_authenticated ON public.products;

CREATE POLICY products_select_anon ON public.products
  FOR SELECT TO anon
  USING (
    deleted_at IS NULL
    AND is_active = true
    AND COALESCE(is_temporary, false) = false
  );

CREATE POLICY products_select_authenticated ON public.products
  FOR SELECT TO authenticated
  USING (true);

GRANT SELECT ON public.products TO anon;
GRANT SELECT ON public.products TO authenticated;

SELECT
  COUNT(*) AS total_products,
  COUNT(*) FILTER (
    WHERE deleted_at IS NULL
      AND COALESCE(is_active, true)
      AND COALESCE(is_temporary, false) = false
      AND category IS NOT NULL
  ) AS public_catalogue_count
FROM public.products;
