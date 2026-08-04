-- =============================================================================
-- Star Hawk Builders Merchant — 034_quote_request_rls.sql
-- =============================================================================
-- Adds the missing RLS policies and table grants for quote_requests and
-- quote_request_items. The dashboard pages/actions were using the service-role
-- client, but production requests were reaching Postgres as authenticated and
-- failing with "permission denied for table quote_requests" because RLS was
-- enabled with no policies and no grants for the authenticated role.
--
-- These policies mirror the admin-only pattern used by audit_logs and
-- public_share_views: authenticated admins get full CRUD, everyone else is
-- denied by default. Public quote submissions continue to use the service-role
-- client and are unaffected.
--
-- Idempotent: every statement uses DROP ... IF EXISTS / GRANT (no-op if
-- already present).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. quote_requests
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS quote_requests_select ON public.quote_requests;
CREATE POLICY quote_requests_select ON public.quote_requests
  FOR SELECT TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS quote_requests_insert ON public.quote_requests;
CREATE POLICY quote_requests_insert ON public.quote_requests
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS quote_requests_update ON public.quote_requests;
CREATE POLICY quote_requests_update ON public.quote_requests
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS quote_requests_delete ON public.quote_requests;
CREATE POLICY quote_requests_delete ON public.quote_requests
  FOR DELETE TO authenticated USING (public.is_admin());

-- ---------------------------------------------------------------------------
-- 2. quote_request_items
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS quote_request_items_select ON public.quote_request_items;
CREATE POLICY quote_request_items_select ON public.quote_request_items
  FOR SELECT TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS quote_request_items_insert ON public.quote_request_items;
CREATE POLICY quote_request_items_insert ON public.quote_request_items
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS quote_request_items_update ON public.quote_request_items;
CREATE POLICY quote_request_items_update ON public.quote_request_items
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS quote_request_items_delete ON public.quote_request_items;
CREATE POLICY quote_request_items_delete ON public.quote_request_items
  FOR DELETE TO authenticated USING (public.is_admin());

-- ---------------------------------------------------------------------------
-- 3. Grants
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.quote_requests, public.quote_request_items TO authenticated;
