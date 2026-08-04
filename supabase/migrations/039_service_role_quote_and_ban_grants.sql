-- Fix: public quote-request submission and IP-ban management fail because
-- the service_role Postgres role lacks table-level privileges on several
-- tables that are intentionally accessed through createAdminClient().
--
-- Affected flows:
--   - lib/actions/quote-requests.ts (anonymous public shop submission)
--       * SELECT on products to re-fetch cart items and prevent tampering
--       * INSERT on quote_requests and quote_request_items
--       * DELETE on quote_requests for best-effort rollback on failure
--   - lib/actions/admin-ip-bans.ts (admin IP ban UI)
--       * SELECT, INSERT on ip_bans (table has no anon/authenticated policies)
--
-- service_role bypasses RLS but still needs base-table GRANTs. Without
-- these, the queries return SQLSTATE 42501 "permission denied".
--
-- This migration is idempotent: GRANT is a no-op if the privilege already
-- exists, and DROP POLICY IF EXISTS guards the policy creation.

GRANT SELECT ON public.products TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quote_requests TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quote_request_items TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ip_bans TO service_role;
