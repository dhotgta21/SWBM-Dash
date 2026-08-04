-- =============================================================================
-- DEMO WIPE: clients + invoices (SQL Editor)
-- =============================================================================
-- Run this BEFORE re-seeding if you already have demo clients/invoices.
-- Preserves: staff/admin users, products, company_settings.
--
-- SAFETY: only run on a dedicated DEMO Supabase project.
-- =============================================================================

BEGIN;

UPDATE public.quote_requests
   SET created_invoice_id = NULL
 WHERE created_invoice_id IS NOT NULL;

DELETE FROM public.invoices;

DELETE FROM auth.users
 WHERE id IN (SELECT id FROM public.profiles WHERE role = 'client');

DELETE FROM public.clients;

DELETE FROM public.document_sequences
 WHERE prefix IN (
   SELECT invoice_prefix FROM public.company_settings WHERE id = 1
   UNION ALL
   SELECT quotation_prefix FROM public.company_settings WHERE id = 1
 );

COMMIT;

SELECT 'Wipe complete' AS status,
       (SELECT COUNT(*) FROM public.clients) AS clients_left,
       (SELECT COUNT(*) FROM public.invoices) AS invoices_left;
