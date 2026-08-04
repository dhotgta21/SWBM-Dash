-- Migration 083: Rollback for migration 082 Security Advisor remediation
--
-- Run this SQL manually (or apply as a migration) only if migration 082 caused
-- unexpected access issues in production. It restores the pre-082 state:
--   - pg_trgm back in public schema
--   - broad public SELECT policies on logos / team-assets storage buckets
--   - PUBLIC execute grant on all previously public functions
--   - removes the restrictive RLS policies added in 082
--
-- Note: search_path hardening from 082 is reset to the server default, which
-- matches the original pre-082 function configuration.

-- ┌───────────────────────────────────────────────────────────────────────────┐
-- │ A. Move pg_trgm back to public                                            │
-- └───────────────────────────────────────────────────────────────────────────┘

ALTER EXTENSION pg_trgm SET SCHEMA public;

-- ┌───────────────────────────────────────────────────────────────────────────┐
-- │ B. Reset function search_path settings added in 082                       │
-- └───────────────────────────────────────────────────────────────────────────┘

ALTER FUNCTION public.search_products(text, integer, boolean, boolean) RESET search_path;
ALTER FUNCTION public.guard_last_admin_on_deactivate() RESET search_path;
ALTER FUNCTION public.generate_unique_account_number() RESET search_path;
ALTER FUNCTION public.freeze_invoice_ownership() RESET search_path;
ALTER FUNCTION public.guard_last_admin() RESET search_path;
ALTER FUNCTION public.touch_updated_at() RESET search_path;
ALTER FUNCTION public.generate_unique_client_account_number() RESET search_path;
ALTER FUNCTION public.guard_last_admin_on_delete() RESET search_path;
ALTER FUNCTION public.array_to_text(text[]) RESET search_path;
ALTER FUNCTION public.get_category_code_prefix(text) RESET search_path;
ALTER FUNCTION public.pin_company_settings_updated_by() RESET search_path;
ALTER FUNCTION public.pin_company_bank_updated_by() RESET search_path;

-- ┌───────────────────────────────────────────────────────────────────────────┐
-- │ C. Re-create broad public SELECT policies on storage buckets              │
-- └───────────────────────────────────────────────────────────────────────────┘

DROP POLICY IF EXISTS "Public read access on logos" ON storage.objects;
CREATE POLICY "Public read access on logos"
  ON storage.objects FOR SELECT TO public USING (bucket_id = 'logos');

DROP POLICY IF EXISTS "Public read access on team-assets" ON storage.objects;
CREATE POLICY "Public read access on team-assets"
  ON storage.objects FOR SELECT TO public USING (bucket_id = 'team-assets');

-- ┌───────────────────────────────────────────────────────────────────────────┐
-- │ D. Re-grant PUBLIC execute on all previously public functions             │
-- └───────────────────────────────────────────────────────────────────────────┘

GRANT EXECUTE ON FUNCTION public.accept_invitation(text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, integer, integer) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.convert_quote_request_to_invoice(uuid, uuid, text, date, text, text, text, text, text, text, numeric, numeric, numeric, jsonb, uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.convert_quote_to_invoice(uuid, uuid, boolean) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.enforce_max_company_contact_channels() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.enforce_max_company_emails() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.enforce_profile_update_scope() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_document_number(text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_unique_order_number() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_staff_permission(text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_client_of_invoice(uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_ip_banned(inet) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_own_client(uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.recompute_invoice_paid() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_ip_email(inet, text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.replace_company_contact_channels(integer, jsonb, jsonb) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_products(text, integer, boolean, boolean) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.seed_client_inventory_from_invoice() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.touch_client_delivery_addresses_updated_at() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.touch_client_quotes_updated_at() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.unban_ip(inet) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_invoice_with_items(uuid, uuid, jsonb) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.write_audit_log() TO PUBLIC;

-- ┌───────────────────────────────────────────────────────────────────────────┐
-- │ E. Drop restrictive RLS policies added in 082                             │
-- └───────────────────────────────────────────────────────────────────────────┘

DROP POLICY IF EXISTS "deny_all_direct_access" ON public.document_sequences;
DROP POLICY IF EXISTS "service_role_only" ON public.invoice_assistant_api_key;
DROP POLICY IF EXISTS "service_role_only" ON public.ip_bans;
DROP POLICY IF EXISTS "service_role_only" ON public.ip_email_log;
DROP POLICY IF EXISTS "deny_all_direct_access" ON public.rate_limits;
