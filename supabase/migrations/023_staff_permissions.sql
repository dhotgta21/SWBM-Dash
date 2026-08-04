-- 023_staff_permissions.sql
-- Per-staff capability toggles. Stored as JSONB on profiles so an admin
-- can flip individual features on/off from Settings without code changes.
--
-- Schema:
--   {
--     "see_dashboard": bool,
--     "see_clients": bool, "see_products": bool, "see_invoices": bool,
--     "clients": { "add": bool, "edit": bool, "delete": bool, "see_money": bool },
--     "products": { "add": bool, "edit": bool, "delete": bool, "see_prices": bool },
--     "invoices": {
--       "add": bool, "edit": bool, "delete": bool, "see_money": bool,
--       "send_email": bool, "record_payment": bool, "change_status": bool
--     }
--   }
--
-- NULL means "use the code-level defaults" (see lib/auth/permissions.ts).
-- Admin role always gets full access — the column is only consulted for
-- staff users.
--
-- This migration is additive and safe to run on an existing database.
-- Existing rows keep permissions = NULL and inherit defaults at runtime.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS permissions jsonb DEFAULT NULL;

-- Track when the admin last tweaked this row's permissions. Useful for
-- audit + the editor UI ("last changed 3 days ago by …").
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS permissions_updated_at timestamptz DEFAULT NULL;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS permissions_updated_by uuid DEFAULT NULL
    REFERENCES auth.users(id) ON DELETE SET NULL;
