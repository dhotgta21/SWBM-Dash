-- =============================================================================
-- 129_undelivered_alerts_pg_cron.sql
-- =============================================================================
-- Move the hourly undelivered-delivery alert job off Vercel Cron and into
-- Postgres itself. The page subscribes to the alerts table via Supabase
-- Realtime, so the dashboard updates the moment the table changes -- no
-- client-side polling, no Vercel plan ceiling, no external secret to rotate.
--
--   1. pg_cron: schedule raise_undelivered_alerts() every 30 minutes. This is
--      the time-based check ("assigned 24h+ ago, still not delivered").
--   2. Triggers: on delivery_loads and invoices, when the columns that
--      affect "is this still overdue?" change, run the same function
--      immediately so the dashboard auto-resolves alerts the instant a
--      driver marks a load delivered (or staff unassigns a load).
--   3. Add delivery_alerts to the supabase_realtime publication so the
--      client-side subscription actually receives events.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- A. pg_cron schedule (idempotent, mirrors the pattern in 090 / 105)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'
  ) THEN
    PERFORM cron.unschedule('raise-undelivered-alerts');
    PERFORM cron.schedule(
      'raise-undelivered-alerts',
      '*/30 * * * *',  -- every 30 minutes (handles the 24h+ overdue sweep)
      $cron$ SELECT public.raise_undelivered_alerts(); $cron$
    );
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- B. Triggers for instant resolution on state changes
--    The existing raise_undelivered_alerts() is SECURITY DEFINER and is
--    already a no-op for the rows that don't need touching, so calling it
--    from a trigger is cheap and self-healing.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.trg_sync_undelivered_alerts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.raise_undelivered_alerts();
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS delivery_loads_sync_alerts ON public.delivery_loads;
CREATE TRIGGER delivery_loads_sync_alerts
  AFTER UPDATE OF assigned_driver_id, assigned_at, status
  ON public.delivery_loads
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.trg_sync_undelivered_alerts();

DROP TRIGGER IF EXISTS invoices_sync_delivery_alerts ON public.invoices;
CREATE TRIGGER invoices_sync_delivery_alerts
  AFTER UPDATE OF picking_status
  ON public.invoices
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.trg_sync_undelivered_alerts();

-- ─────────────────────────────────────────────────────────────────────────────
-- C. supabase_realtime publication
--    The dashboard's client subscription only receives events for tables
--    added to this publication. Idempotent -- skip if already present.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime'
       AND schemaname = 'public'
       AND tablename = 'delivery_alerts'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.delivery_alerts;
  END IF;
END $$;
