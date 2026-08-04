-- =============================================================================
-- 142_auto_deliver_and_alert_fixes.sql
-- =============================================================================
-- 1. auto_deliver_stale_loads keyed off printed_at: a load printed 24h+ ago
--    but assigned to a driver minutes ago could be auto-completed before the
--    driver ever attempted delivery (and unassigned printed loads completed
--    with no driver involved). The clock now starts at assignment when a
--    driver is assigned (COALESCE(assigned_at, printed_at)), and unassigned
--    loads are NOT auto-completed.
-- 2. check_delivery_alerts resolve branch ignored soft-deleted invoices:
--    deleting an invoice with an open alert left it on the dashboard forever.
--    Alerts for deleted invoices now auto-resolve.
-- =============================================================================

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
       -- Only auto-complete loads that are actually with a driver, and only
       -- once the driver has had the full window since ASSIGNMENT.
       AND assigned_driver_id IS NOT NULL
       AND assigned_at IS NOT NULL
       AND assigned_at <= v_cutoff
     ORDER BY assigned_at
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
         AND picking_status <> 'delivered'
         AND deleted_at IS NULL;

      -- Settle tracked stock to what actually left the yard.
      PERFORM public.reconcile_invoice_stock_from_loads(v_load.invoice_id);
    END IF;

    v_completed := v_completed + 1;
  END LOOP;

  RETURN v_completed;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.auto_deliver_stale_loads() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auto_deliver_stale_loads() TO service_role;

COMMENT ON FUNCTION public.auto_deliver_stale_loads() IS
  'Completes printed, driver-assigned loads whose assignment is older than company_settings.auto_deliver_after_hours (default 24h, 0 disables), marking their invoices delivered once all loads are done. Runs every 30 min via pg_cron.';

CREATE OR REPLACE FUNCTION public.raise_undelivered_alerts()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_raised integer := 0;
BEGIN
  -- Auto-resolve alerts that are no longer overdue — including alerts whose
  -- invoice was soft-deleted (previously left open forever).
  UPDATE public.delivery_alerts da
     SET status = 'resolved', resolved_at = now()
   WHERE da.status = 'open'
     AND (
       EXISTS (
         SELECT 1 FROM public.invoices i
          WHERE i.id = da.invoice_id
            AND (i.picking_status = 'delivered' OR i.deleted_at IS NOT NULL)
       )
       OR EXISTS (
         SELECT 1 FROM public.delivery_loads dl
          WHERE dl.id = da.load_id
            AND (dl.status = 'completed' OR dl.assigned_driver_id IS NULL)
       )
     );

  -- Raise new alerts (one open alert per invoice, enforced by the unique index).
  WITH candidates AS (
    SELECT dl.invoice_id, dl.id AS load_id, dl.assigned_driver_id AS driver_id
      FROM public.delivery_loads dl
      JOIN public.invoices i ON i.id = dl.invoice_id
     WHERE dl.assigned_driver_id IS NOT NULL
       AND dl.status = 'printed'
       AND dl.assigned_at IS NOT NULL
       AND dl.assigned_at < now() - interval '24 hours'
       AND i.deleted_at IS NULL
       AND i.picking_status <> 'delivered'
       AND NOT EXISTS (
         SELECT 1 FROM public.delivery_alerts da
          WHERE da.invoice_id = dl.invoice_id AND da.status = 'open'
       )
  ), inserted AS (
    INSERT INTO public.delivery_alerts (invoice_id, load_id, driver_id, alert_type, status)
    SELECT invoice_id, load_id, driver_id, 'overdue_delivery', 'open'
      FROM candidates
    ON CONFLICT DO NOTHING
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_raised FROM inserted;

  RETURN v_raised;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.raise_undelivered_alerts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.raise_undelivered_alerts() TO service_role;
