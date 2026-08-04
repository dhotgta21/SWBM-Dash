-- =============================================================================
-- 146 — Serialize committed load writes + DB-level over-allocation guard
-- =============================================================================
-- Problem: the office load tools (createOfficeLoad / updateOfficeLoad /
-- moveLoadItems in lib/actions/picker.ts) validate quantities against
-- committed loads and then write via several round-trips with no lock.
-- Concurrent with a picker confirm_load (or another office writer) this can
-- over-allocate a line beyond the ordered quantity, corrupting printed load
-- totals and stock reconciliation.
--
-- Fix: a BEFORE INSERT/UPDATE trigger on delivery_load_items that, for rows
-- on committed loads (printed/completed):
--   1. locks the parent invoice row FOR UPDATE — serializing all committed
--      load writers for that invoice (same strategy as confirm_load in
--      migration 141), and
--   2. rejects the write when the committed total for the line would exceed
--      the ordered quantity.
--
-- Open loads are provisional picker state and are intentionally skipped —
-- they are validated under the invoice lock by confirm_load when printed.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.guard_load_item_allocation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice_id uuid;
  v_load_status text;
  v_ordered numeric;
  v_total numeric;
BEGIN
  SELECT dl.invoice_id, dl.status INTO v_invoice_id, v_load_status
    FROM public.delivery_loads dl
   WHERE dl.id = NEW.load_id;

  -- Only guard committed loads; open loads are checked at confirm time.
  IF v_load_status IS NULL OR v_load_status NOT IN ('printed', 'completed') THEN
    RETURN NEW;
  END IF;

  -- Serialize concurrent committed-load writers for this invoice.
  PERFORM 1 FROM public.invoices WHERE id = v_invoice_id FOR UPDATE;

  SELECT quantity INTO v_ordered
    FROM public.invoice_items
   WHERE id = NEW.invoice_item_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid invoice item.' USING ERRCODE = 'P0002';
  END IF;

  SELECT COALESCE(SUM(dli.quantity), 0) INTO v_total
    FROM public.delivery_load_items dli
    JOIN public.delivery_loads dl ON dl.id = dli.load_id
   WHERE dli.invoice_item_id = NEW.invoice_item_id
     AND dl.status IN ('printed', 'completed')
     -- On UPDATE the row being replaced still holds its old value; exclude
     -- it so the effective total is (others + NEW).
     AND (TG_OP = 'INSERT' OR dli.id <> OLD.id);

  IF v_total + NEW.quantity > v_ordered + 0.000001 THEN
    RAISE EXCEPTION 'LOAD_OVER_ALLOCATED' USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_load_item_allocation ON public.delivery_load_items;
CREATE TRIGGER trg_guard_load_item_allocation
  BEFORE INSERT OR UPDATE ON public.delivery_load_items
  FOR EACH ROW EXECUTE FUNCTION public.guard_load_item_allocation();
