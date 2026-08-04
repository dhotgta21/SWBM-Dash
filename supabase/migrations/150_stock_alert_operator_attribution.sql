-- =============================================================================
-- 150 — Operator attribution for stock-alert goods-in RPCs
-- =============================================================================
-- mark_stock_alert_ordered / receive_stock_alert_goods are only executable
-- by service_role (migration 132) and are called via the service-role admin
-- client, so auth.uid() is always NULL inside them. receive_stock_alert_goods
-- attributed the stock bump and the alert resolution to auth.uid(), so every
-- goods-in recorded stock_updated_by / resolved_by as NULL ("System") and
-- the stock history trigger logged changed_by NULL.
--
-- Fix: take p_operator_id (the authenticated operator's id, already verified
-- app-side in lib/actions/stock.ts) and validate it against profiles: the
-- operator must exist, be active, and be an admin or a staff member with
-- products_edit. Attribution columns now use p_operator_id.
-- =============================================================================

DROP FUNCTION IF EXISTS public.mark_stock_alert_ordered(uuid, numeric, date, text);

CREATE FUNCTION public.mark_stock_alert_ordered(
  p_alert_id uuid,
  p_operator_id uuid,
  p_quantity_ordered numeric DEFAULT NULL,
  p_expected_delivery_date date DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Authorize via p_operator_id (service-role-only RPC; the calling server
  -- action has already authenticated the operator).
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
     WHERE p.id = p_operator_id
       AND p.is_active = true
       AND (p.role = 'admin'
            OR (p.role = 'staff' AND (p.permissions->>'products_edit')::boolean = true))
  ) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF p_quantity_ordered IS NOT NULL AND p_quantity_ordered < 0 THEN
    RAISE EXCEPTION 'Quantity ordered must be 0 or more' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.stock_audit_alerts
     SET status = 'ordered',
         quantity_ordered = p_quantity_ordered,
         expected_delivery_date = p_expected_delivery_date,
         notes = COALESCE(NULLIF(trim(p_notes), ''), notes),
         resolved_at = NULL,
         resolved_by = NULL
   WHERE id = p_alert_id
     AND status IN ('open', 'ordered');

  RETURN FOUND;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.mark_stock_alert_ordered(uuid, uuid, numeric, date, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_stock_alert_ordered(uuid, uuid, numeric, date, text) TO service_role;


DROP FUNCTION IF EXISTS public.receive_stock_alert_goods(uuid, numeric, text);

CREATE FUNCTION public.receive_stock_alert_goods(
  p_alert_id uuid,
  p_operator_id uuid,
  p_quantity_received numeric,
  p_notes text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_alert public.stock_audit_alerts%ROWTYPE;
  v_qty numeric(12,3);
  v_track boolean;
  v_enable_stock boolean;
BEGIN
  -- Authorize via p_operator_id (service-role-only RPC; the calling server
  -- action has already authenticated the operator).
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
     WHERE p.id = p_operator_id
       AND p.is_active = true
       AND (p.role = 'admin'
            OR (p.role = 'staff' AND (p.permissions->>'products_edit')::boolean = true))
  ) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF p_quantity_received IS NULL OR p_quantity_received <= 0 THEN
    RAISE EXCEPTION 'Quantity received must be greater than zero' USING ERRCODE = 'P0001';
  END IF;

  v_qty := round(p_quantity_received::numeric, 3);

  SELECT * INTO v_alert
    FROM public.stock_audit_alerts
   WHERE id = p_alert_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Alert not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_alert.status NOT IN ('open', 'ordered') THEN
    RAISE EXCEPTION 'Alert is already closed' USING ERRCODE = 'P0001';
  END IF;

  SELECT enable_stock_routing INTO v_enable_stock
    FROM public.company_settings WHERE id = 1;

  -- Only bump product qty when routing is on and product tracks stock.
  IF v_enable_stock IS TRUE AND v_alert.product_id IS NOT NULL THEN
    SELECT track_stock INTO v_track
      FROM public.products
     WHERE id = v_alert.product_id
     FOR UPDATE;

    IF v_track IS TRUE THEN
      UPDATE public.products
         SET stock_quantity = stock_quantity + v_qty,
             stock_updated_at = now(),
             stock_updated_by = p_operator_id
       WHERE id = v_alert.product_id;
    END IF;
  END IF;

  UPDATE public.stock_audit_alerts
     SET status = 'received',
         quantity_received = v_qty,
         received_at = now(),
         resolved_at = now(),
         resolved_by = p_operator_id,
         notes = COALESCE(NULLIF(trim(p_notes), ''), notes)
   WHERE id = p_alert_id;

  RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.receive_stock_alert_goods(uuid, uuid, numeric, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.receive_stock_alert_goods(uuid, uuid, numeric, text) TO service_role;


-- ─────────────────────────────────────────────────────────────────────────────
-- Stock history trigger: prefer stock_updated_by over auth.uid()
-- ─────────────────────────────────────────────────────────────────────────────
-- log_product_stock_change (migration 124) recorded changed_by = auth.uid(),
-- which is NULL for service-role writes (goods-in, invoice deductions). The
-- writers that know the operator set products.stock_updated_by in the same
-- UPDATE, so prefer it — but only when THIS write changed it: invoice
-- deduction RPCs (deduct_invoice_stock / restore_invoice_stock) adjust
-- stock_quantity without touching stock_updated_by, and using the stale
-- row value would misattribute the deduction to an unrelated operator.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.log_product_stock_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_set text := NULLIF(current_setting('app.stock_source', true), '');
  v_actor uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_actor := COALESCE(NEW.stock_updated_by, auth.uid());
    IF NEW.stock_quantity IS NOT NULL AND NEW.stock_quantity <> 0 THEN
      INSERT INTO public.stock_take_logs
        (product_id, previous_quantity, new_quantity, changed_by, changed_at, source)
      VALUES
        (NEW.id, 0, NEW.stock_quantity, v_actor, now(), COALESCE(v_set, 'opening'));
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.stock_quantity IS DISTINCT FROM NEW.stock_quantity THEN
    -- Only attribute to stock_updated_by when this very write set it;
    -- otherwise fall back to auth.uid() (may be NULL for system writes).
    v_actor := CASE
      WHEN NEW.stock_updated_by IS DISTINCT FROM OLD.stock_updated_by THEN NEW.stock_updated_by
      ELSE auth.uid()
    END;
    INSERT INTO public.stock_take_logs
      (product_id, previous_quantity, new_quantity, changed_by, changed_at, source)
    VALUES
      (NEW.id, COALESCE(OLD.stock_quantity, 0), COALESCE(NEW.stock_quantity, 0),
       v_actor, now(), COALESCE(v_set, 'auto'));
  END IF;
  RETURN NEW;
END;
$$;
