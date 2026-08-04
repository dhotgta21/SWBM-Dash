-- =============================================================================
-- Migration 132: Draft ageing — soft-delete stale drafts after 6 days
-- =============================================================================
--
-- Draft documents (invoices AND quotations) that are never issued now age out
-- into the Recently deleted bin instead of being hard-deleted:
--
--   day 2  → warning shown in the list ("issue it or it will be deleted")
--   day 4  → hard warning
--   day 6  → THIS JOB soft-deletes the draft (deleted_at = now()), so it lands
--            in Recently deleted where it can be restored within the 30-day
--            retention window.
--
-- Previously cleanup_stale_draft_invoices() (migration 105) HARD-deleted
-- drafts after 7 days — nothing to restore, no warning. The daily pg_cron job
-- 'cleanup-stale-draft-invoices' (03:00 UTC, scheduled in 105) calls this
-- function by name, so replacing the body is all that is needed; the schedule
-- is re-asserted below for safety.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.cleanup_stale_draft_invoices()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ids uuid[];
BEGIN
  -- Soft-delete: mark the document deleted so it appears in Recently deleted
  -- and stays restorable, instead of vanishing without a trace.
  WITH doomed AS (
    UPDATE public.invoices
       SET deleted_at = now(),
           updated_at = now()
     WHERE status = 'draft'
       AND deleted_at IS NULL
       AND amount_paid = 0
       AND updated_at < now() - interval '6 days'
    RETURNING id
  )
  SELECT COALESCE(array_agg(id), '{}') INTO v_ids FROM doomed;

  UPDATE public.invoice_items
     SET deleted_at = now()
   WHERE invoice_id = ANY (v_ids)
     AND deleted_at IS NULL;

  RETURN COALESCE(array_length(v_ids, 1), 0);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cleanup_stale_draft_invoices() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_stale_draft_invoices() TO service_role;

COMMENT ON FUNCTION public.cleanup_stale_draft_invoices() IS
  'Daily cron: soft-delete draft invoices/quotations idle for 6+ days into the Recently deleted bin (restorable). Replaced the 7-day hard delete from migration 105.';

-- Re-assert the daily schedule (idempotent, mirrors 105/129 pattern).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('cleanup-stale-draft-invoices');
    PERFORM cron.schedule(
      'cleanup-stale-draft-invoices',
      '0 3 * * *',
      'SELECT public.cleanup_stale_draft_invoices();'
    );
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'pg_cron not available or schedule failed: %', SQLERRM;
END $$;
