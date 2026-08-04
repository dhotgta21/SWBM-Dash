-- =============================================================================
-- Star Hawk Builders Merchant — 020_audit_infrastructure.sql
-- =============================================================================
-- Creates the audit_logs table and the write_audit_log() trigger helper.
-- Later migrations (starting with 021_client_portal.sql) attach triggers that
-- call public.write_audit_log(), so this file must run first.
--
-- This migration is fully idempotent: every statement uses IF NOT EXISTS /
-- CREATE OR REPLACE / DROP POLICY IF EXISTS so it can be re-run against an
-- already-migrated database without error.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- audit_logs
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name text NOT NULL,
  record_id text,
  action text NOT NULL CHECK (action IN ('insert', 'update', 'delete')),
  old_data jsonb,
  new_data jsonb,
  performed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  performed_at timestamptz NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- write_audit_log() — trigger helper for AFTER INSERT/UPDATE/DELETE
-- audit logging. SECURITY DEFINER so the trigger can insert into
-- audit_logs even when the calling user has no INSERT grant.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.write_audit_log() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_performed_by uuid := auth.uid();
  v_action text;
  v_table text := TG_TABLE_NAME;
  v_record_id text;
  v_old jsonb;
  v_new jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := 'insert';
    v_new := to_jsonb(NEW);
    v_record_id := COALESCE(NEW.id::text, NULL);
  ELSIF TG_OP = 'UPDATE' THEN
    v_action := 'update';
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
    v_record_id := COALESCE(NEW.id::text, OLD.id::text, NULL);
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'delete';
    v_old := to_jsonb(OLD);
    v_record_id := COALESCE(OLD.id::text, NULL);
  END IF;

  INSERT INTO public.audit_logs (table_name, record_id, action, old_data, new_data, performed_by)
  VALUES (v_table, v_record_id, v_action, v_old, v_new, v_performed_by);

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS — audit_logs is admin-only for direct reads/writes. Triggers still
-- write because the function is SECURITY DEFINER.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_logs_select ON public.audit_logs;
CREATE POLICY audit_logs_select ON public.audit_logs
  FOR SELECT TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS audit_logs_insert ON public.audit_logs;
CREATE POLICY audit_logs_insert ON public.audit_logs
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());

-- ─────────────────────────────────────────────────────────────────────────────
-- Grants
-- ─────────────────────────────────────────────────────────────────────────────
GRANT SELECT ON public.audit_logs TO authenticated;
GRANT INSERT ON public.audit_logs TO authenticated;
