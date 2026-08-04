-- ⚠️  WARNING: NUCLEAR OPTION ⚠️
-- This script deletes ALL users and ALL business data they created.
-- Only run this if you want a completely fresh start.
--
-- Tables deleted (in dependency order):
--   invoice_items, payments, public_share_views, invoices,
--   client_invitations, clients, client_invites, profiles, auth.users
--
-- Tables with SET NULL foreign keys will keep their rows but the user
-- references will become NULL.
--
-- How to run:
--   psql "postgres://postgres.<project_ref>:<password>@aws-0-eu-west-2.pooler.supabase.com:5432/postgres?sslmode=require" -f scripts/delete-all-users-nuclear.sql
--
-- Or use the Supabase SQL Editor and paste this in.

BEGIN;

-- 1. Child tables of invoices
DELETE FROM public.invoice_items;
DELETE FROM public.public_share_views;
-- payments are deleted by the invoices cascade, but we delete explicitly to be explicit
DELETE FROM public.payments;

-- 2. Invoices (must be deleted before clients because invoices.client_id is RESTRICT)
DELETE FROM public.invoices;

-- 3. Client invitations (cascade from clients, but explicit is safer)
DELETE FROM public.client_invitations;

-- 4. Clients (created_by RESTRICT on auth.users)
DELETE FROM public.clients;

-- 5. Client invites (invited_by RESTRICT on auth.users)
DELETE FROM public.client_invites;

-- 6. Audit logs reference users but with SET NULL, so we can leave them
--    or truncate if you want a clean audit trail.
-- TRUNCATE TABLE public.audit_logs;

-- 7. Profiles cascade-deleted when auth.users are deleted, but we delete
--    explicitly in case you want to audit what was removed.
DELETE FROM public.profiles;

-- 8. Finally, delete all auth users. This also triggers CASCADE deletes on profiles.
DELETE FROM auth.users;

COMMIT;
