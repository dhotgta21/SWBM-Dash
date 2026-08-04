-- Migration 090: Quote-request cleanup for rejected/cancelled requests.
--
-- 1. Adds public.cleanup_stale_quote_requests() so rejected or cancelled
--    quote requests are automatically removed after a 7-day grace period.
-- 2. Schedules the cleanup via pg_cron when the extension is available.
-- 3. Wipes existing test quote requests as requested before go-live.

-- ┌───────────────────────────────────────────────────────────────────────────┐
-- │ A. Cleanup function for stale quote requests                              │
-- └───────────────────────────────────────────────────────────────────────────┘

CREATE OR REPLACE FUNCTION public.cleanup_stale_quote_requests()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted integer;
BEGIN
  -- Rejected/cancelled requests are kept for 7 days so staff have a window
  -- to revert a decision if needed. After that they are removed to avoid
  -- storing unused data. The grace period is measured from processed_at
  -- (when the admin changed the status) with a fallback to updated_at.
  DELETE FROM public.quote_requests
  WHERE status IN ('rejected', 'cancelled')
    AND COALESCE(processed_at, updated_at) < now() - interval '7 days';

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

COMMENT ON FUNCTION public.cleanup_stale_quote_requests()
  IS 'Deletes quote requests marked rejected or cancelled more than 7 days ago.';

-- ┌───────────────────────────────────────────────────────────────────────────┐
-- │ B. Schedule daily cleanup via pg_cron when available                      │
-- └───────────────────────────────────────────────────────────────────────────┘

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'
  ) THEN
    -- Remove any previous schedule with the same name so this migration is
    -- idempotent.
    PERFORM cron.unschedule('cleanup-stale-quote-requests');
    PERFORM cron.schedule(
      'cleanup-stale-quote-requests',
      '0 3 * * *',  -- 03:00 UTC daily
      $cron$ SELECT public.cleanup_stale_quote_requests(); $cron$
    );
  END IF;
END $$;

-- ┌───────────────────────────────────────────────────────────────────────────┐
-- │ C. Wipe existing test quote requests                                      │
-- └───────────────────────────────────────────────────────────────────────────┘

-- All existing quote requests are test/random data. Line items are removed
-- automatically via ON DELETE CASCADE on quote_request_items.
DELETE FROM public.quote_requests;
