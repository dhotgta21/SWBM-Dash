-- Fix: deleting a staff/admin user fails with "Could not verify user dependencies".
--
-- The dependency check in lib/actions/team.ts counts rows in public.payments
-- using createAdminClient(), which connects as the service_role Postgres role.
-- The service_role role bypasses Row Level Security but still needs base-table
-- privileges; without SELECT on public.payments the count query returns
-- SQLSTATE 42501 "permission denied for table payments". The action catches
-- that error and surfaces a generic "Could not verify user dependencies" message.
--
-- This migration is idempotent: GRANT is a no-op if the privilege already exists.

GRANT SELECT ON public.payments TO service_role;
