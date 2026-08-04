-- Migration 052: Grant service_role write access to products
-- The product server actions switched to the service-role admin client so
-- staff with products_edit permission can update SEO/structured-data fields
-- without relaxing the admin-only RLS policy. This grant gives the
-- service_role the table privileges it needs while RLS remains in place for
-- anon/authenticated sessions.

GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO service_role;
