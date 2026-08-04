-- Fix: public share view (/invoice/[token]) returns "Invoice not available"
-- because the service_role Postgres role has no SELECT grants on the
-- business tables. The page resolves the token via createAdminClient(),
-- which connects as the service_role role from SUPABASE_SERVICE_ROLE_KEY.
--
-- The service_role role bypasses Row Level Security, but it does NOT
-- bypass table-level GRANTs — that's a Postgres-level check that runs
-- before RLS. The previous schema only GRANTed these tables to
-- `authenticated`, so the service-role query returns 42501
-- "permission denied for table invoices" and .maybeSingle() returns
-- null, which page.tsx converts into a 404.
--
-- This is idempotent: GRANT is a no-op if the privilege already exists,
-- so re-running on a partially-fixed DB is safe.

GRANT SELECT ON
  public.invoices,
  public.invoice_items,
  public.clients,
  public.company_settings,
  public.company_bank_details
TO service_role;

-- The public page logs each view to public_share_views (best-effort).
-- Without this INSERT grant the view log silently fails — non-fatal,
-- but the audit trail is empty and ops can't detect leaked links.
GRANT INSERT ON public.public_share_views TO service_role;

-- Comments document the intent for future readers.
COMMENT ON TABLE public.invoices IS
  'Readable by authenticated (RLS-scoped) and by service_role (full bypass) for the public share view at /invoice/[token].';
