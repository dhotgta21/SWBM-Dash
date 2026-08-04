-- 124_stock_history_and_grants.sql
--
-- 1. Fix the "You are not authorised to perform that action" (42501) error on
--    the Products → Stock audit tab. Migration 109 enabled RLS on the stock
--    tables and added policies TO authenticated, but never granted the
--    underlying table privilege to authenticated. A policy without a table
--    GRANT still returns 42501, so even admins could not read stock_audit_alerts.
-- 2. Introduce an append-only stock_take_logs table + trigger that records
--    every products.stock_quantity change (old → new, who, when, source).
-- 3. Add a set_product_stock() RPC used by the manual stock take so those
--    changes are tagged source='stock_take' and attributed to the real user.
--
-- Idempotent: safe to re-run.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Missing table GRANTs for the picker/stock tables (the auth fix)
--    Reads happen as `authenticated`; writes stay on the service role
--    (SECURITY DEFINER server actions), so only SELECT is granted here.
-- ─────────────────────────────────────────────────────────────────────────────
GRANT SELECT ON public.stock_audit_alerts TO authenticated;
GRANT SELECT ON public.delivery_loads TO authenticated;
GRANT SELECT ON public.delivery_load_items TO authenticated;
GRANT SELECT ON public.stock_audit_alerts TO service_role;
GRANT SELECT ON public.delivery_loads TO service_role;
GRANT SELECT ON public.delivery_load_items TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. stock_take_logs — append-only audit of stock quantity changes
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.stock_take_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  previous_quantity numeric(12,3) NOT NULL,
  new_quantity numeric(12,3) NOT NULL,
  changed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'auto'
);

COMMENT ON TABLE public.stock_take_logs IS
  'Append-only history of products.stock_quantity changes. Written by the log_product_stock_change trigger; read-only to operators.';
COMMENT ON COLUMN public.stock_take_logs.source IS
  'stock_take = manual take from the Stock tab; opening = initial qty on create; auto = system/invoice-driven change.';

CREATE INDEX IF NOT EXISTS idx_stock_take_logs_product_time
  ON public.stock_take_logs (product_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_take_logs_changed_at
  ON public.stock_take_logs (changed_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Capture trigger — logs every stock_quantity change regardless of caller.
--    Uses auth.uid()/now() (not the row's stock_updated_*) because some invoice
--    RPCs change stock_quantity without touching stock_updated_by.
--    Source defaults: 'opening' (insert), 'auto' (update); overridden when the
--    caller sets a transaction-local app.stock_source (see set_product_stock).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.log_product_stock_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_set text := NULLIF(current_setting('app.stock_source', true), '');
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.stock_quantity IS NOT NULL AND NEW.stock_quantity <> 0 THEN
      INSERT INTO public.stock_take_logs
        (product_id, previous_quantity, new_quantity, changed_by, changed_at, source)
      VALUES
        (NEW.id, 0, NEW.stock_quantity, auth.uid(), now(), COALESCE(v_set, 'opening'));
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.stock_quantity IS DISTINCT FROM NEW.stock_quantity THEN
    INSERT INTO public.stock_take_logs
      (product_id, previous_quantity, new_quantity, changed_by, changed_at, source)
    VALUES
      (NEW.id, COALESCE(OLD.stock_quantity, 0), COALESCE(NEW.stock_quantity, 0),
       auth.uid(), now(), COALESCE(v_set, 'auto'));
  END IF;
  RETURN NEW;
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_product_stock_change() TO authenticated;

DROP TRIGGER IF EXISTS products_log_stock_change_upd ON public.products;
CREATE TRIGGER products_log_stock_change_upd
  AFTER UPDATE OF stock_quantity ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.log_product_stock_change();

DROP TRIGGER IF EXISTS products_log_stock_change_ins ON public.products;
CREATE TRIGGER products_log_stock_change_ins
  AFTER INSERT ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.log_product_stock_change();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. RLS + grants for stock_take_logs (read-only audit; trigger writes)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.stock_take_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS stock_take_logs_select ON public.stock_take_logs;
CREATE POLICY stock_take_logs_select ON public.stock_take_logs
  FOR SELECT TO authenticated
  USING (public.is_admin() OR public.has_staff_permission('see_products'));

GRANT SELECT ON public.stock_take_logs TO authenticated;
GRANT SELECT ON public.stock_take_logs TO service_role;
-- No INSERT/UPDATE/DELETE to authenticated: immutable. Only the SECURITY
-- DEFINER trigger writes rows.

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. set_product_stock — manual stock take entry point. Tags the change as
--    'stock_take' (via transaction-local app.stock_source read by the trigger)
--    and attributes it to the real operator (auth.uid()).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_product_stock(
  p_product_id uuid,
  p_quantity numeric
)
RETURNS numeric(12,3)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_qty numeric(12,3);
BEGIN
  IF auth.role() <> 'service_role' THEN
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
    END IF;
    IF NOT (public.is_admin() OR public.has_staff_permission('products_edit')) THEN
      RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF p_quantity IS NULL OR p_quantity < 0 THEN
    RAISE EXCEPTION 'Stock quantity must be 0 or more' USING ERRCODE = 'P0001';
  END IF;

  v_qty := round(p_quantity::numeric, 3);

  -- Tag this change so the audit trigger records source='stock_take'.
  PERFORM set_config('app.stock_source', 'stock_take', true);

  UPDATE public.products
     SET stock_quantity = v_qty,
         stock_updated_at = now(),
         stock_updated_by = auth.uid()
   WHERE id = p_product_id
     AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product not found' USING ERRCODE = 'P0002';
  END IF;

  RETURN v_qty;
END;
$$;

REVOKE ALL ON FUNCTION public.set_product_stock(uuid, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_product_stock(uuid, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_product_stock(uuid, numeric) TO service_role;

COMMENT ON FUNCTION public.set_product_stock(uuid, numeric) IS
  'Manual stock take: sets products.stock_quantity and logs source=stock_take.';
