-- =============================================================================
-- Star Hawk Builders Merchant — 025_security_hardening.sql
-- =============================================================================
-- Defence-in-depth tightening surfaced by the security review:
--
--   1. client_invitations.token — hide the credential from authenticated
--      users. Staff never need to read the raw token; the service-role action
--      layer handles minting / looking up tokens when sending or accepting
--      invites. This removes the info-disclosure window where any operator who
--      can see a client also sees every pending invite token.
--
--   2. count_quote_requests_in_window() — restrict execution to the service
--      role. The function counts requests for any email and is only called from
--      submitQuoteRequest via admin.rpc. Revoking PUBLIC execution prevents it
--      from ever being exposed to anon/authenticated callers accidentally.
--
-- Idempotency: REVOKE / GRANT are safe to re-run.
-- =============================================================================

-- =============================================================================
-- 1. Don't leak invite tokens to authenticated staff users
-- =============================================================================

REVOKE SELECT (token) ON public.client_invitations FROM authenticated;


-- =============================================================================
-- 2. quote-request quota counter: service_role only
-- =============================================================================

REVOKE EXECUTE ON FUNCTION public.count_quote_requests_in_window(text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.count_quote_requests_in_window(text, integer) TO service_role;
