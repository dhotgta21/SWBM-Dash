-- =============================================================================
-- FIX: invoices.picking_* columns + payment trigger (migration 108/110)
-- =============================================================================
-- Your DB has recompute_invoice_paid() referencing picking_status, but the
-- columns were never added (partial schema apply). Run this ONCE before
-- 01_demo_clients_invoices.sql.
--
-- Safe / idempotent: ADD COLUMN IF NOT EXISTS.
-- =============================================================================

-- 1. Columns
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS picking_status text NOT NULL DEFAULT 'not_started';

-- Constraint may already exist after a prior partial run
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'invoices_picking_status_check'
  ) THEN
    ALTER TABLE public.invoices
      ADD CONSTRAINT invoices_picking_status_check
      CHECK (picking_status IN (
        'not_started','in_progress','partially_loaded','loaded','completed','delivered'
      ));
  END IF;
END $$;

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS picking_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS picking_loaded_at timestamptz,
  ADD COLUMN IF NOT EXISTS picking_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS picking_delivered_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_invoices_picking_status
  ON public.invoices(status, picking_status, created_at);

-- 2. Payment recompute trigger (matches stock-routing behaviour)
CREATE OR REPLACE FUNCTION public.recompute_invoice_paid()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice_id uuid := COALESCE(NEW.invoice_id, OLD.invoice_id);
  v_paid numeric;
  v_total numeric;
  v_current_status text;
  v_new_status text;
BEGIN
  IF v_invoice_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(SUM(amount), 0)
    INTO v_paid
    FROM public.payments
   WHERE invoice_id = v_invoice_id;

  SELECT total, status
    INTO v_total, v_current_status
    FROM public.invoices
   WHERE id = v_invoice_id;

  v_new_status := CASE
    WHEN v_total IS NULL THEN v_current_status
    WHEN v_total > 0 AND v_paid >= v_total THEN 'paid'
    WHEN v_paid > 0 THEN 'partial'
    WHEN v_current_status = 'draft' THEN 'draft'
    ELSE 'sent'
  END;

  UPDATE public.invoices
     SET amount_paid = v_paid,
         status = v_new_status,
         picking_status = CASE
           WHEN v_new_status = 'paid'
                AND picking_status IS DISTINCT FROM 'delivered'
             THEN 'delivered'
           ELSE picking_status
         END,
         picking_delivered_at = CASE
           WHEN v_new_status = 'paid'
                AND picking_status IS DISTINCT FROM 'delivered'
             THEN now()
           ELSE picking_delivered_at
         END,
         updated_at = now()
   WHERE id = v_invoice_id;

  RETURN NULL;
END;
$$;

-- Confirm columns exist
SELECT column_name, data_type
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND table_name = 'invoices'
   AND column_name LIKE 'picking%'
 ORDER BY column_name;
