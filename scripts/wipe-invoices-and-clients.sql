-- =============================================================================
-- One-time wipe: invoices, customers (clients), and client portal accounts.
-- =============================================================================
-- Run this via scripts/wipe-invoices-and-clients.mjs. It runs inside a single
-- transaction; any failure rolls everything back.
--
-- What is removed:
--   * All invoices + invoice_items + payments + public_share_views
--   * All client_invitations + client_inventory + client_quotes
--     + client_delivery_addresses
--   * All client profiles and their auth.users records
--   * All clients
--   * Document number sequences for the invoice and quotation prefixes
--
-- What is preserved:
--   * Staff / admin profiles and auth.users accounts
--   * Products, categories, company settings, bank details
--   * Anonymous quote_requests (only their created_invoice_id is nulled)
--   * Audit logs
-- =============================================================================

BEGIN;

-- 1. Detach anonymous quote requests from invoices that are about to be deleted.
UPDATE public.quote_requests
   SET created_invoice_id = NULL
 WHERE created_invoice_id IS NOT NULL;

-- 2. Delete every invoice. Dependent rows in invoice_items, payments and
--    public_share_views are removed automatically via ON DELETE CASCADE.
DELETE FROM public.invoices;

-- 3. Delete client portal auth users. Their public.profiles rows cascade away
--    because profiles.id REFERENCES auth.users(id) ON DELETE CASCADE.
--    Admin/staff accounts are preserved because we only target profiles whose
--    role is 'client'.
DELETE FROM auth.users
 WHERE id IN (SELECT id FROM public.profiles WHERE role = 'client');

-- 4. Delete every client. Remaining dependent rows (invitations, inventory,
--    quotes, delivery addresses) cascade via ON DELETE CASCADE.
DELETE FROM public.clients;

-- 5. Reset document numbering for invoice and quotation prefixes so the next
--    document starts at 1 in the current month.
DELETE FROM public.document_sequences
 WHERE prefix IN (
   SELECT invoice_prefix FROM public.company_settings WHERE id = 1
   UNION ALL
   SELECT quotation_prefix FROM public.company_settings WHERE id = 1
 );

COMMIT;
