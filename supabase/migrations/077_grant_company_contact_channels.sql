-- Fix: settings page shows "permission denied for table company_phones / company_emails"
-- because the authenticated role lacked table-level privileges on these tables.
-- RLS policies already restrict reads/writes appropriately, but Postgres still
-- requires the base GRANT before the policies can take effect.

GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_phones TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_emails TO authenticated;

-- service_role is used by lib/company.ts to load public contact details for
-- headers/footers; without SELECT it silently falls back to empty arrays.
GRANT SELECT ON public.company_phones TO service_role;
GRANT SELECT ON public.company_emails TO service_role;
