-- ─────────────────────────────────────────────────────────────────────────────
-- 140: driver_mark_delivered hardening
--
-- 1. Soft-deleted invoices: completing the last load of a deleted invoice
--    previously updated picking_status and called
--    reconcile_invoice_stock_from_loads, which raises 'Invoice not found'
--    for deleted invoices — rolling back the whole RPC and stranding the
--    driver's load. Refuse up front with a clear error.
-- 2. Load status guard: only printed/completed loads may be marked delivered
--    (defence in depth — assignment already restricts to printed/completed).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.driver_mark_delivered(
  p_load_id uuid,
  p_driver_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_load public.delivery_loads%ROWTYPE;
  v_invoice_id uuid;
  v_now timestamptz := now();
  v_all_done boolean;
  v_invoice_deleted_at timestamptz;
BEGIN
  SELECT * INTO v_load FROM public.delivery_loads WHERE id = p_load_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Load not found.' USING ERRCODE = 'P0002';
  END IF;
  IF v_load.assigned_driver_id IS DISTINCT FROM p_driver_id THEN
    RAISE EXCEPTION 'This load is not assigned to you.' USING ERRCODE = '42501';
  END IF;
  IF v_load.status NOT IN ('printed', 'completed') THEN
    RAISE EXCEPTION 'Only printed or completed loads can be marked as delivered.' USING ERRCODE = 'P0001';
  END IF;

  v_invoice_id := v_load.invoice_id;

  SELECT deleted_at INTO v_invoice_deleted_at FROM public.invoices
   WHERE id = v_invoice_id;
  IF NOT FOUND OR v_invoice_deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'This order has been removed and can no longer be delivered.' USING ERRCODE = 'P0002';
  END IF;

  -- Complete the load if it isn't already.
  IF v_load.status <> 'completed' THEN
    UPDATE public.delivery_loads
       SET status = 'completed', completed_at = v_now
     WHERE id = p_load_id;
  END IF;

  -- Are there any loads for this invoice that aren't completed yet?
  SELECT NOT EXISTS (
    SELECT 1 FROM public.delivery_loads
     WHERE invoice_id = v_invoice_id
       AND status <> 'completed'
  ) INTO v_all_done;

  IF v_all_done THEN
    UPDATE public.invoices
       SET picking_status = 'delivered',
           picking_delivered_at = v_now
     WHERE id = v_invoice_id
       AND picking_status <> 'delivered';

    -- Settle tracked stock to what actually left the yard.
    PERFORM public.reconcile_invoice_stock_from_loads(v_invoice_id);
  END IF;

  RETURN jsonb_build_object(
    'invoice_id', v_invoice_id,
    'delivered', v_all_done
  );
END;
$$;
