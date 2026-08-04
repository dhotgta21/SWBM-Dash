-- Migration 082: Supabase Security Advisor remediation
--
-- Resolves all currently reported Security Advisor warnings:
--   - function_search_path_mutable (11 functions)
--   - extension_in_public (pg_trgm)
--   - public_bucket_allows_listing (logos, team-assets)
--   - anon_security_definer_function_executable (25 functions)
--   - authenticated_security_definer_function_executable (25 functions)
--   - rls_enabled_no_policy INFO items (5 tables)
--
-- Dashboard change required separately:
--   - Enable Leaked Password Protection in Supabase Auth → Security.
--
-- All grants below match the roles the application actually uses:
--   - anon / authenticated for public surfaces
--   - authenticated for dashboard RPCs
--   - service_role for server-only admin actions and trigger internals

-- ┌───────────────────────────────────────────────────────────────────────────┐
-- │ A. Move pg_trgm out of the public schema                                  │
-- └───────────────────────────────────────────────────────────────────────────┘

CREATE SCHEMA IF NOT EXISTS extensions;

ALTER EXTENSION pg_trgm SET SCHEMA extensions;

-- search_products() uses unqualified similarity() and trigram operator classes.
-- It must search both the app schema and the extensions schema.
ALTER FUNCTION public.search_products(text, integer, boolean, boolean)
  SET search_path = public, extensions, pg_temp;

-- ┌───────────────────────────────────────────────────────────────────────────┐
-- │ B. Harden search_path on flagged functions                                │
-- └───────────────────────────────────────────────────────────────────────────┘

ALTER FUNCTION public.guard_last_admin_on_deactivate() SET search_path = public, pg_temp;
ALTER FUNCTION public.generate_unique_account_number() SET search_path = public, pg_temp;
ALTER FUNCTION public.freeze_invoice_ownership() SET search_path = public, pg_temp;
ALTER FUNCTION public.guard_last_admin() SET search_path = public, pg_temp;
ALTER FUNCTION public.touch_updated_at() SET search_path = public, pg_temp;
ALTER FUNCTION public.generate_unique_client_account_number() SET search_path = public, pg_temp;
ALTER FUNCTION public.guard_last_admin_on_delete() SET search_path = public, pg_temp;
ALTER FUNCTION public.array_to_text(text[]) SET search_path = public, pg_temp;
ALTER FUNCTION public.get_category_code_prefix(text) SET search_path = public, pg_temp;
ALTER FUNCTION public.pin_company_settings_updated_by() SET search_path = public, pg_temp;
ALTER FUNCTION public.pin_company_bank_updated_by() SET search_path = public, pg_temp;

-- ┌───────────────────────────────────────────────────────────────────────────┐
-- │ C. Revoke default PUBLIC execute on all flagged SECURITY DEFINER          │
-- │    functions. Postgres grants execute to PUBLIC by default, which is why  │
-- │    anon and authenticated can currently call them.                        │
-- └───────────────────────────────────────────────────────────────────────────┘

REVOKE EXECUTE ON FUNCTION public.accept_invitation(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.check_rate_limit(text, integer, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.convert_quote_request_to_invoice(uuid, uuid, text, date, text, text, text, text, text, text, numeric, numeric, numeric, jsonb, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.convert_quote_to_invoice(uuid, uuid, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.enforce_max_company_contact_channels() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.enforce_max_company_emails() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.enforce_profile_update_scope() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.generate_document_number(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.generate_unique_order_number() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_staff_permission(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_client_of_invoice(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_ip_banned(inet) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_own_client(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.recompute_invoice_paid() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.record_ip_email(inet, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.replace_company_contact_channels(integer, jsonb, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.search_products(text, integer, boolean, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.seed_client_inventory_from_invoice() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.touch_client_delivery_addresses_updated_at() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.touch_client_quotes_updated_at() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.unban_ip(inet) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_invoice_with_items(uuid, uuid, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.write_audit_log() FROM PUBLIC;

-- ┌───────────────────────────────────────────────────────────────────────────┐
-- │ D. Re-grant execute only to the roles the application actually uses       │
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

-- Service-role-only server actions
GRANT EXECUTE ON FUNCTION public.accept_invitation(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.convert_quote_request_to_invoice(uuid, uuid, text, date, text, text, text, text, text, text, numeric, numeric, numeric, jsonb, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.convert_quote_to_invoice(uuid, uuid, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_ip_banned(inet) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_ip_email(inet, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.unban_ip(inet) TO service_role;

-- Trigger-only functions need no further grants; triggers run under the table
-- owner's privileges. Revoking PUBLIC only removes the RPC exposure.

-- ┌───────────────────────────────────────────────────────────────────────────┐
-- │ E. Remove broad SELECT policies on public storage buckets                 │
-- │    The buckets themselves are public=true, so object URLs still work.     │
-- └───────────────────────────────────────────────────────────────────────────┘

DROP POLICY IF EXISTS "Public read access on logos" ON storage.objects;
DROP POLICY IF EXISTS "Public read access on team-assets" ON storage.objects;

-- ┌───────────────────────────────────────────────────────────────────────────┐
-- │ F. Add explicit restrictive RLS policies to INFO tables                   │
-- │    These tables are intentionally accessed only via SECURITY DEFINER      │
-- │    functions or service_role. The policies make that intent explicit.     │
-- └───────────────────────────────────────────────────────────────────────────┘

-- PostgreSQL does not support CREATE POLICY IF NOT EXISTS, so drop first.
DROP POLICY IF EXISTS "deny_all_direct_access" ON public.document_sequences;
CREATE POLICY "deny_all_direct_access" ON public.document_sequences
  AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false);

DROP POLICY IF EXISTS "service_role_only" ON public.invoice_assistant_api_key;
CREATE POLICY "service_role_only" ON public.invoice_assistant_api_key
  AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false);

DROP POLICY IF EXISTS "service_role_only" ON public.ip_bans;
CREATE POLICY "service_role_only" ON public.ip_bans
  AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false);

DROP POLICY IF EXISTS "service_role_only" ON public.ip_email_log;
CREATE POLICY "service_role_only" ON public.ip_email_log
  AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false);

DROP POLICY IF EXISTS "deny_all_direct_access" ON public.rate_limits;
CREATE POLICY "deny_all_direct_access" ON public.rate_limits
  AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false);

-- ┌───────────────────────────────────────────────────────────────────────────┐
-- │ G. Document locked-down tables                                            │
-- └───────────────────────────────────────────────────────────────────────────┘

COMMENT ON TABLE public.document_sequences IS 'Direct access denied. Mutated only via generate_document_number().';
COMMENT ON TABLE public.rate_limits IS 'Direct access denied. Accessed only via check_rate_limit().';
COMMENT ON TABLE public.ip_bans IS 'Service-role only.';
COMMENT ON TABLE public.ip_email_log IS 'Service-role and SECURITY DEFINER record_ip_email() only.';
COMMENT ON TABLE public.invoice_assistant_api_key IS 'Service-role only.';
