-- Fix: admins cannot send client portal invites because the service_role
-- Postgres role has no table-level privileges on public.client_invitations.
--
-- sendClientInvite(), revokeClientInvite() and acceptInviteWithToken() in
-- lib/actions/invites.ts perform INSERT/UPDATE/DELETE/SELECT on this table
-- via createAdminClient(), which connects as the service_role role from
-- SUPABASE_SERVICE_ROLE_KEY.
--
-- The service_role role bypasses Row Level Security, but it does NOT bypass
-- ordinary table-level GRANTs. Without these privileges the first write
-- returns SQLSTATE 42501 "permission denied for table client_invitations",
-- which safeActionError() maps to the user-facing message:
--   "You are not authorised to perform that action."
--
-- This migration is idempotent: GRANT is a no-op if the privilege already
-- exists, so re-running on a partially-fixed DB is safe.

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_invitations TO service_role;

-- The invite flow also pre-resolves auth users by email via a SELECT on
-- public.profiles using the service-role client. Profiles are mutated only
-- through the SECURITY DEFINER accept_invitation() RPC, so SELECT is enough.
GRANT SELECT ON public.profiles TO service_role;
