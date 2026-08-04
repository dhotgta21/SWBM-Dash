-- Fix: saving settings fails on a fresh install or whenever the single
-- public.company_bank_details row hasn't been created yet.
--
-- lib/actions/settings.ts uses upsert() on company_bank_details with
-- onConflict: 'id'. PostgreSQL executes this as INSERT ... ON CONFLICT
-- DO UPDATE, so the authenticated user needs both INSERT and UPDATE
-- privileges (narrowed by RLS policies). The table already had SELECT
-- and UPDATE policies, but no INSERT policy — causing SQLSTATE 42501
-- "permission denied for table company_bank_details" on first save.
--
-- This migration adds the missing INSERT policy, restricted to admins.
-- It is idempotent: DROP POLICY IF EXISTS guards against re-runs.

DROP POLICY IF EXISTS company_bank_insert ON public.company_bank_details;
CREATE POLICY company_bank_insert ON public.company_bank_details
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());
