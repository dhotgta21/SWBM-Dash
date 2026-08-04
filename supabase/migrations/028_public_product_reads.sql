-- =============================================================================
-- Star Hawk Builders Merchant — 028_public_product_reads.sql
-- =============================================================================
-- Public shop pages need to read the product catalogue without a session.
-- The original policy only granted SELECT to authenticated users, which forced
-- public pages to use the service-role key. This change allows anonymous
-- visitors to read products while keeping mutations restricted to admins.
-- =============================================================================

-- Allow anonymous visitors to select product rows.
DROP POLICY IF EXISTS products_select ON public.products;
CREATE POLICY products_select ON public.products
  FOR SELECT USING (true);

-- Grant table-level SELECT to anon. RLS policies still restrict row access,
-- but Postgres requires the role to have permission on the table itself.
GRANT SELECT ON public.products TO anon;
