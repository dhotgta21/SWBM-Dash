-- =============================================================================
-- 132_revoke_unintended_function_grants.sql
-- =============================================================================
-- Resolve Supabase Security Advisor warnings:
--   0028 anon_security_definer_function_executable
--   0029 authenticated_security_definer_function_executable
--
-- Every SECURITY DEFINER function in `public` is exposed via /rest/v1/rpc/<name>
-- to any role holding EXECUTE. This migration revokes EXECUTE from
-- PUBLIC/anon/authenticated wherever it is NOT intentionally used:
--
--   * Trigger-only functions (fire regardless of grants; should never be
--     callable over the API): trg_sync_undelivered_alerts, log_product_stock_change
--   * Internal-SQL-only helper: restore_invoice_stock (invoked from other
--     SECURITY DEFINER functions, which run as the owner — grants irrelevant)
--   * Defined but never called from app code: adjust_invoice_item_stock,
--     admin_reset_client_account_password, admin_reset_deletion_password,
--     set_client_account_password, set_deletion_password (app uses
--     change_*_password and lib/actions/adminPasswordReset.ts instead)
--   * Called ONLY via the service-role admin client (lib/actions/stock.ts,
--     lib/actions/picker.ts): mark_stock_alert_ordered,
--     receive_stock_alert_goods, reconcile_invoice_stock_from_loads
--
-- Intentionally LEFT executable (see docs/security-runbook.md):
--   * search_products, check_rate_limit — public by design (Next.js server
--     actions enforce Origin + IP rate limits; read-only catalog data)
--   * is_admin, has_staff_permission, is_own_client, is_client_of_invoice —
--     required inside RLS policies for the authenticated role
--   * Staff RPCs invoked with the user's JWT from server actions — each
--     validates the caller internally (permission checks / deletion-password
--     verification).
--
-- Idempotent: REVOKE/GRANT are safe to re-run.
-- =============================================================================

-- Trigger-only functions: remove from the exposed API entirely ---------------
REVOKE EXECUTE ON FUNCTION public.trg_sync_undelivered_alerts() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_product_stock_change() FROM PUBLIC, anon, authenticated;

-- Internal-SQL-only helper ---------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.restore_invoice_stock(uuid) FROM PUBLIC, anon, authenticated;

-- Defined but never called from app code -------------------------------------
REVOKE EXECUTE ON FUNCTION public.adjust_invoice_item_stock(uuid, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_reset_client_account_password(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_reset_deletion_password(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_client_account_password(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_deletion_password(text) FROM PUBLIC, anon, authenticated;

-- Keep service_role access for the admin-reset/set helpers in case a future
-- server-only flow needs them (service_role bypasses RLS and role checks).
GRANT EXECUTE ON FUNCTION public.admin_reset_client_account_password(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_reset_deletion_password(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_client_account_password(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_deletion_password(text) TO service_role;

-- Called only via the service-role admin client (stock.ts / picker.ts) -------
REVOKE EXECUTE ON FUNCTION public.mark_stock_alert_ordered(uuid, numeric, date, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.receive_stock_alert_goods(uuid, numeric, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reconcile_invoice_stock_from_loads(uuid) FROM PUBLIC, anon, authenticated;
