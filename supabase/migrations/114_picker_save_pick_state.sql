-- Atomic picker "save pick state" helper.
--
-- Rewrites the current open load for an invoice inside a single transaction,
-- holding a row lock on the invoice and the open load so concurrent saves do
-- not interleave and produce inconsistent load state.

CREATE OR REPLACE FUNCTION public.save_pick_state(
  p_invoice_id uuid,
  p_picker_id uuid,
  p_items jsonb,
  p_next_picking_status text,
  p_picking_started_at timestamptz
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_load_id uuid;
  v_max_load_number int;
  v_item jsonb;
  v_invoice_status text;
  v_picking_status text;
BEGIN
  -- Caller must be an active picker.
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
     WHERE id = p_picker_id
       AND role = 'picker'
       AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  -- Lock the invoice row and verify it is still pickable.
  SELECT status, picking_status
    INTO v_invoice_status, v_picking_status
    FROM public.invoices
   WHERE id = p_invoice_id
     AND deleted_at IS NULL
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice not available';
  END IF;

  IF v_invoice_status NOT IN ('sent', 'partial')
     OR v_picking_status IN ('completed', 'delivered')
  THEN
    RAISE EXCEPTION 'Invoice not available for picking';
  END IF;

  -- Find or create the open load, locking it so two concurrent saves cannot
  -- both create new open loads.
  SELECT id INTO v_load_id
    FROM public.delivery_loads
   WHERE invoice_id = p_invoice_id
     AND status = 'open'
     AND picked_by = p_picker_id
   FOR UPDATE;

  IF NOT FOUND THEN
    SELECT COALESCE(MAX(load_number), 0) INTO v_max_load_number
      FROM public.delivery_loads
     WHERE invoice_id = p_invoice_id;

    INSERT INTO public.delivery_loads (invoice_id, load_number, status, picked_by)
    VALUES (p_invoice_id, v_max_load_number + 1, 'open', p_picker_id)
    RETURNING id INTO v_load_id;
  ELSE
    DELETE FROM public.delivery_load_items WHERE load_id = v_load_id;
  END IF;

  -- Insert the new load items.
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    IF (v_item->>'status') = 'loaded'
       AND COALESCE((v_item->>'quantity')::numeric, 0) <= 0
    THEN
      CONTINUE;
    END IF;

    INSERT INTO public.delivery_load_items (
      load_id,
      invoice_item_id,
      quantity,
      status,
      stock_alert_type
    ) VALUES (
      v_load_id,
      (v_item->>'invoiceItemId')::uuid,
      (v_item->>'quantity')::numeric,
      v_item->>'status',
      NULLIF(v_item->>'alertType', '')
    );
  END LOOP;

  -- Advance the invoice picking status.
  UPDATE public.invoices
     SET picking_status = p_next_picking_status,
         picking_started_at = COALESCE(picking_started_at, p_picking_started_at)
   WHERE id = p_invoice_id;

  RETURN v_load_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.save_pick_state(uuid, uuid, jsonb, text, timestamptz) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.save_pick_state(uuid, uuid, jsonb, text, timestamptz) FROM anon;
GRANT EXECUTE ON FUNCTION public.save_pick_state(uuid, uuid, jsonb, text, timestamptz) TO service_role;
