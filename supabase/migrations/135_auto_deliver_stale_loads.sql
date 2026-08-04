-- =============================================================================
-- 135_auto_deliver_stale_loads.sql
-- =============================================================================
-- Auto-mark deliveries as delivered. Once a load is printed it is on the
-- vehicle, so if the driver has not confirmed delivery within a configurable
-- number of hours (default 24), the system completes the load itself:
--
--   * load        -> status 'completed'
--   * invoice     -> picking_status 'delivered' once ALL its loads are done
--   * stock       -> reconciled to the loaded quantities (same settle as
--                    driver_mark_delivered / mark_order_completed)
--   * overdue delivery_alerts auto-resolve via the existing
--     delivery_loads_sync_alerts trigger (migration 129)
--
-- The threshold lives on the single-row company_settings table so office
-- staff can adjust it from Settings -> Company ("Deliveries" section).
-- Set it to 0 to turn automatic delivery off.
--
-- The sweep runs in Postgres every 30 minutes via pg_cron (same pattern as
-- migration 129) — no Vercel cron, no external secret.
--
-- Idempotent: safe to re-run.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- A. Configurable threshold (hours). 0 disables the sweep.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS auto_deliver_after_hours integer NOT NULL DEFAULT 24;

-- ─────────────────────────────────────────────────────────────────────────────
-- B. The sweep
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.auto_deliver_stale_loads()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hours integer;
  v_cutoff timestamptz;
  v_load record;
  v_completed integer := 0;
BEGIN
  SELECT auto_deliver_after_hours INTO v_hours
    FROM public.company_settings
   WHERE id = 1;

  v_hours := COALESCE(v_hours, 24);
  IF v_hours <= 0 THEN
    RETURN 0; -- automatic delivery disabled
  END IF;

  v_cutoff := now() - make_interval(hours => v_hours);

  FOR v_load IN
    SELECT id, invoice_id
      FROM public.delivery_loads
     WHERE status = 'printed'
       AND printed_at IS NOT NULL
       AND printed_at <= v_cutoff
     ORDER BY printed_at
  LOOP
    UPDATE public.delivery_loads
       SET status = 'completed',
           completed_at = now()
     WHERE id = v_load.id;

    -- When every load for the invoice is done, the order is delivered.
    IF NOT EXISTS (
      SELECT 1 FROM public.delivery_loads
       WHERE invoice_id = v_load.invoice_id
         AND status <> 'completed'
    ) THEN
      UPDATE public.invoices
         SET picking_status = 'delivered',
             picking_delivered_at = now()
       WHERE id = v_load.invoice_id
         AND picking_status <> 'delivered';

      -- Settle tracked stock to what actually left the yard.
      PERFORM public.reconcile_invoice_stock_from_loads(v_load.invoice_id);
    END IF;

    v_completed := v_completed + 1;
  END LOOP;

  RETURN v_completed;
END;
$$;

-- Only the service role (server actions) may invoke it directly; pg_cron
-- runs as the scheduler role and is unaffected by these grants.
REVOKE EXECUTE ON FUNCTION public.auto_deliver_stale_loads() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auto_deliver_stale_loads() TO service_role;

COMMENT ON FUNCTION public.auto_deliver_stale_loads() IS
  'Completes printed loads older than company_settings.auto_deliver_after_hours (default 24h, 0 disables) and marks their invoices delivered once all loads are done. Runs every 30 min via pg_cron.';

-- ─────────────────────────────────────────────────────────────────────────────
-- C. pg_cron schedule (idempotent, mirrors migration 129)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'
  ) THEN
    PERFORM cron.unschedule('auto-deliver-stale-loads');
    PERFORM cron.schedule(
      'auto-deliver-stale-loads',
      '*/30 * * * *',  -- every 30 minutes
      $cron$ SELECT public.auto_deliver_stale_loads(); $cron$
    );
  END IF;
END $$;
