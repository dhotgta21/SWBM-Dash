-- =============================================================================
-- FIX: products missing columns + public/admin SELECT RLS
-- =============================================================================
-- Symptoms this fixes:
--   • Homepage / catalogue /admin/products show ZERO products
--   • PostgREST errors like:
--       column products.deleted_at does not exist
--       column products.is_temporary does not exist
--   • Anon role has no SELECT grant or RLS blocks public reads
--
-- Run this in Supabase → SQL Editor BEFORE 02_construction_products.sql
-- (safe to re-run anytime).
-- =============================================================================

-- 1) Columns the app always filters on
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS is_temporary boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS promoted_at timestamptz,
  ADD COLUMN IF NOT EXISTS temp_placeholder_code boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS track_stock boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stock_quantity numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reorder_level numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_by uuid;

CREATE INDEX IF NOT EXISTS idx_products_deleted_at
  ON public.products(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_products_is_temporary
  ON public.products(is_temporary) WHERE is_temporary = true;

-- 2) Ensure every existing row is catalogue-visible by default
UPDATE public.products
   SET is_active = COALESCE(is_active, true),
       is_temporary = COALESCE(is_temporary, false)
 WHERE is_active IS NULL
    OR is_temporary IS NULL;

-- Soft-deleted rows should stay soft-deleted; clear only accidental flags
-- when the operator re-runs product seed (02 sets deleted_at = NULL on upsert).

-- 3) RLS: drop every products SELECT policy we have used historically, then
--    install the catalogue-safe pair (anon filtered / authenticated full).
DROP POLICY IF EXISTS products_select ON public.products;
DROP POLICY IF EXISTS products_select_anon ON public.products;
DROP POLICY IF EXISTS products_select_authenticated ON public.products;

CREATE POLICY products_select_anon ON public.products
  FOR SELECT
  TO anon
  USING (
    deleted_at IS NULL
    AND is_active = true
    AND COALESCE(is_temporary, false) = false
  );

CREATE POLICY products_select_authenticated ON public.products
  FOR SELECT
  TO authenticated
  USING (true);

-- 4) Table privileges (RLS still applies)
GRANT SELECT ON public.products TO anon;
GRANT SELECT ON public.products TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO service_role;

-- 5) Diagnostics
SELECT
  COUNT(*) AS total_products,
  COUNT(*) FILTER (
    WHERE deleted_at IS NULL
      AND COALESCE(is_active, true)
      AND COALESCE(is_temporary, false) = false
      AND category IS NOT NULL
  ) AS public_catalogue_count,
  COUNT(*) FILTER (WHERE deleted_at IS NOT NULL) AS soft_deleted,
  COUNT(*) FILTER (WHERE COALESCE(is_temporary, false)) AS temporary_count
FROM public.products;

SELECT polname AS policy_name, polcmd AS command
FROM pg_policy
WHERE polrelid = 'public.products'::regclass
ORDER BY polname;
