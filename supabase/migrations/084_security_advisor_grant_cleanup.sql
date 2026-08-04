-- Migration 084: Clean up leftover authenticated grants on trigger-only
-- and service-role-only SECURITY DEFINER functions.
--
-- Migration 082 revoked PUBLIC execute, but some functions still had explicit
-- grants to authenticated from earlier migrations. This migration removes
-- those grants while preserving the intended access model:
--   - Trigger-only functions: no role needs direct EXECUTE.
--   - Service-role-only server actions: only service_role gets EXECUTE.

-- ┌───────────────────────────────────────────────────────────────────────────┐
-- │ A. Revoke authenticated EXECUTE on trigger-only functions                 │
-- └───────────────────────────────────────────────────────────────────────────┘

REVOKE EXECUTE ON FUNCTION public.enforce_max_company_contact_channels() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_max_company_emails() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_profile_update_scope() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.recompute_invoice_paid() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.seed_client_inventory_from_invoice() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.touch_client_delivery_addresses_updated_at() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.touch_client_quotes_updated_at() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.touch_updated_at() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.write_audit_log() FROM authenticated;

-- ┌───────────────────────────────────────────────────────────────────────────┐
-- │ B. Revoke authenticated EXECUTE on service-role-only functions            │
-- └───────────────────────────────────────────────────────────────────────────┘

REVOKE EXECUTE ON FUNCTION public.accept_invitation(text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.convert_quote_request_to_invoice(
  uuid, uuid, text, date, text, text, text, text, text, text,
  numeric, numeric, numeric, jsonb, uuid
) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.convert_quote_to_invoice(uuid, uuid, boolean) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.is_ip_banned(inet) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.record_ip_email(inet, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.unban_ip(inet) FROM authenticated;

-- ┌───────────────────────────────────────────────────────────────────────────┐
-- │ C. Revoke anon EXECUTE on functions that are not public surfaces          │
-- └───────────────────────────────────────────────────────────────────────────┘

REVOKE EXECUTE ON FUNCTION public.generate_document_number(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.generate_unique_order_number() FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_staff_permission(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_client_of_invoice(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_own_client(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.replace_company_contact_channels(integer, jsonb, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_invoice_with_items(uuid, uuid, jsonb) FROM anon;
