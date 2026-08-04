-- =============================================================================
-- 131_service_role_write_grants.sql
-- =============================================================================
-- Fix the "You are not authorised to perform that action." (42501) error in
-- the picker/driver load flow.
--
-- Migration 124 granted only SELECT on the picker/stock tables to
-- service_role, and migration 128 created delivery_alerts with RLS enabled
-- and no table grants at all. But several role-verified server actions write
-- these tables DIRECTLY via the service-role client (not through a SECURITY
-- DEFINER function), e.g. confirmLoad UPDATEs delivery_loads. Without the
-- underlying table privilege Postgres returns 42501 even for service_role,
-- which left loads stuck in 'open' (qty accounted, never printed).
--
-- Writes only ever happen from server actions that verify the caller's role
-- first; authenticated keeps SELECT-only + RLS. stock_take_logs is
-- intentionally untouched (only the SECURITY DEFINER trigger writes it).
--
-- Idempotent: safe to re-run.
-- =============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.delivery_loads TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.delivery_load_items TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_audit_alerts TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.delivery_alerts TO service_role;
