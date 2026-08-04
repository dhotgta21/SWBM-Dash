-- Migration 091: Supabase Security Advisor follow-up
--
-- Resolves the current Security Advisor warnings that are not intentional:
--   - anon_security_definer_function_executable for cleanup_stale_quote_requests
--   - authenticated_security_definer_function_executable for
--     cleanup_stale_quote_requests and enforce_profile_update_scope
--
-- The remaining flagged functions are intentionally SECURITY DEFINER and are
-- left callable by the roles that need them:
--   - check_rate_limit(text, integer, integer)              → anon, authenticated
--   - search_products(text, integer, boolean, boolean)      → anon, authenticated
--   - update_invoice_with_items(uuid, uuid, jsonb)          → authenticated
--   - generate_document_number(text)                        → authenticated, service_role
--   - generate_unique_order_number()                        → authenticated
--   - has_staff_permission(text)                            → authenticated, service_role
--   - is_admin()                                            → authenticated
--   - is_client_of_invoice(uuid)                            → authenticated
--   - is_own_client(uuid)                                   → authenticated
--   - replace_company_contact_channels(integer, jsonb, jsonb) → authenticated
--
-- These helpers are used inside RLS policies and cannot safely be switched to
-- SECURITY INVOKER (the policies and the functions query the same tables, which
-- would create RLS recursion / privilege failures). The public-facing RPCs need
-- elevated privileges to write to tables that are otherwise locked down.
--
-- Non-SQL action required separately:
--   - Enable "Leaked Password Protection" in Supabase Dashboard → Auth → Security.

-- ┌───────────────────────────────────────────────────────────────────────────┐
-- │ A. Revoke default PUBLIC EXECUTE on all flagged SECURITY DEFINER functions│
-- │    Postgres grants EXECUTE to PUBLIC by default for new functions, which  │
-- │    is what exposes them to anon / authenticated.                          │
-- └───────────────────────────────────────────────────────────────────────────┘

REVOKE EXECUTE ON FUNCTION public.check_rate_limit(text, integer, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cleanup_stale_quote_requests() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_profile_update_scope() FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.generate_document_number(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.generate_unique_order_number() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_staff_permission(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_client_of_invoice(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_own_client(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.replace_company_contact_channels(integer, jsonb, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.search_products(text, integer, boolean, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_invoice_with_items(uuid, uuid, jsonb) FROM PUBLIC;

-- ┌───────────────────────────────────────────────────────────────────────────┐
-- │ B. Re-grant EXECUTE only to the roles the application actually uses       │
-- └───────────────────────────────────────────────────────────────────────────┘

-- Public / authenticated surfaces
GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, integer, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_products(text, integer, boolean, boolean) TO anon, authenticated;

-- Authenticated dashboard surfaces
GRANT EXECUTE ON FUNCTION public.generate_document_number(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.generate_unique_order_number() TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_staff_permission(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_client_of_invoice(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_own_client(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.replace_company_contact_channels(integer, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_invoice_with_items(uuid, uuid, jsonb) TO authenticated;

-- Server-only cleanup function (Vercel cron uses service_role; pg_cron runs as
-- the table owner and does not need a role grant).
GRANT EXECUTE ON FUNCTION public.cleanup_stale_quote_requests() TO service_role;

-- enforce_profile_update_scope is a trigger-only function. Triggers run under
-- the table owner's privileges, so no role needs direct EXECUTE.
