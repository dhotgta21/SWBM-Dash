-- =============================================================================
-- 128_delivery_alerts.sql
-- =============================================================================
-- Overdue-delivery alerts. When a printed load has been assigned to a driver
-- for more than 24 hours and the invoice still isn't marked delivered, raise
-- an alert that surfaces on the operator dashboard. The alert auto-resolves
-- once the invoice is delivered (or the load is completed/unassigned).
--
--   1. delivery_alerts table (+ dedup index: one open alert per invoice).
--   2. RLS.
--   3. raise_undelivered_alerts() RPC (service_role only) called by the cron.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Table
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.delivery_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  load_id uuid REFERENCES public.delivery_loads(id) ON DELETE SET NULL,
  driver_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  alert_type text NOT NULL DEFAULT 'overdue_delivery'
    CHECK (alert_type IN ('overdue_delivery')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_delivery_alerts_status
  ON public.delivery_alerts(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_delivery_alerts_invoice
  ON public.delivery_alerts(invoice_id);

-- One open alert per invoice keeps the dashboard from spamming duplicates.
CREATE UNIQUE INDEX IF NOT EXISTS uq_delivery_alerts_open_invoice
  ON public.delivery_alerts(invoice_id)
  WHERE status = 'open';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. RLS
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.delivery_alerts ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'delivery_alerts' AND policyname = 'delivery_alerts_admin_all'
  ) THEN
    CREATE POLICY delivery_alerts_admin_all ON public.delivery_alerts
      FOR ALL TO authenticated
      USING (public.is_admin())
      WITH CHECK (public.is_admin());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'delivery_alerts' AND policyname = 'delivery_alerts_staff_read'
  ) THEN
    CREATE POLICY delivery_alerts_staff_read ON public.delivery_alerts
      FOR SELECT TO authenticated
      USING (public.has_staff_permission('see_invoices'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'delivery_alerts' AND policyname = 'delivery_alerts_driver_own'
  ) THEN
    CREATE POLICY delivery_alerts_driver_own ON public.delivery_alerts
      FOR SELECT TO authenticated
      USING (auth.uid() = driver_id);
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. raise_undelivered_alerts()
--    Raises an open alert for every assigned, printed load older than 24h whose
--    invoice is not yet delivered (deduped per invoice). Auto-resolves alerts
--    whose invoice is delivered or whose load is completed/unassigned.
--    Returns the number of newly raised alerts.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.raise_undelivered_alerts()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_raised integer := 0;
BEGIN
  -- Auto-resolve alerts that are no longer overdue.
  UPDATE public.delivery_alerts da
     SET status = 'resolved', resolved_at = now()
   WHERE da.status = 'open'
     AND (
       EXISTS (
         SELECT 1 FROM public.invoices i
          WHERE i.id = da.invoice_id AND i.picking_status = 'delivered'
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
  SELECT count(*) INTO v_raised FROM inserted;

  RETURN v_raised;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.raise_undelivered_alerts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.raise_undelivered_alerts() TO service_role;
