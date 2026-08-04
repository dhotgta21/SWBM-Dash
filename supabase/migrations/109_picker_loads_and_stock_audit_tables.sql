-- Tables for delivery loads, load line items, and stock audit alerts.
-- These support the picker mobile workflow and admin stock oversight.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Delivery loads (one per printed trip/load for an invoice)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.delivery_loads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  load_number int NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','printed','completed')),
  picked_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  printed_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (invoice_id, load_number)
);

CREATE INDEX IF NOT EXISTS idx_delivery_loads_invoice_id
  ON public.delivery_loads(invoice_id);
CREATE INDEX IF NOT EXISTS idx_delivery_loads_picked_by
  ON public.delivery_loads(picked_by);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Delivery load items (what was loaded/out-of-stock/ordered on a load)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.delivery_load_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  load_id uuid NOT NULL REFERENCES public.delivery_loads(id) ON DELETE CASCADE,
  invoice_item_id uuid NOT NULL REFERENCES public.invoice_items(id) ON DELETE CASCADE,
  quantity numeric(12,3) NOT NULL CHECK (quantity > 0),
  status text NOT NULL CHECK (status IN ('loaded','out_of_stock','order')),
  stock_alert_type text CHECK (stock_alert_type IN ('low_stock','out_of_stock','order')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (load_id, invoice_item_id)
);

CREATE INDEX IF NOT EXISTS idx_delivery_load_items_load_id
  ON public.delivery_load_items(load_id);
CREATE INDEX IF NOT EXISTS idx_delivery_load_items_invoice_item_id
  ON public.delivery_load_items(invoice_item_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Stock audit alerts (raised by picker or system when stock is low)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.stock_audit_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  invoice_item_id uuid REFERENCES public.invoice_items(id) ON DELETE SET NULL,
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  alert_type text NOT NULL CHECK (alert_type IN ('low_stock','out_of_stock','order')),
  source text NOT NULL DEFAULT 'picker' CHECK (source IN ('system','picker')),
  quantity_needed numeric(12,3),
  raised_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  raised_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  notes text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved','ordered'))
);

CREATE INDEX IF NOT EXISTS idx_stock_audit_alerts_status
  ON public.stock_audit_alerts(status);
CREATE INDEX IF NOT EXISTS idx_stock_audit_alerts_product
  ON public.stock_audit_alerts(product_id)
  WHERE product_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_stock_audit_alerts_invoice
  ON public.stock_audit_alerts(invoice_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. updated_at trigger for the new tables
-- ─────────────────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS delivery_loads_touch_updated_at ON public.delivery_loads;
CREATE TRIGGER delivery_loads_touch_updated_at
  BEFORE UPDATE ON public.delivery_loads
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. RLS policies for picker-owned data
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.delivery_loads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_load_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_audit_alerts ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- delivery_loads: admins see all; pickers see their own; staff with invoice
  -- access can see loads for invoices they own or all invoices (admin/staff).
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'delivery_loads' AND policyname = 'delivery_loads_admin_all'
  ) THEN
    CREATE POLICY delivery_loads_admin_all ON public.delivery_loads
      FOR ALL TO authenticated
      USING (public.is_admin())
      WITH CHECK (public.is_admin());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'delivery_loads' AND policyname = 'delivery_loads_picker_own'
  ) THEN
    CREATE POLICY delivery_loads_picker_own ON public.delivery_loads
      FOR ALL TO authenticated
      USING (auth.uid() = picked_by)
      WITH CHECK (auth.uid() = picked_by);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'delivery_loads' AND policyname = 'delivery_loads_staff_read'
  ) THEN
    CREATE POLICY delivery_loads_staff_read ON public.delivery_loads
      FOR SELECT TO authenticated
      USING (public.has_staff_permission('see_invoices'));
  END IF;

  -- delivery_load_items: driven by parent load access.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'delivery_load_items' AND policyname = 'delivery_load_items_admin_all'
  ) THEN
    CREATE POLICY delivery_load_items_admin_all ON public.delivery_load_items
      FOR ALL TO authenticated
      USING (public.is_admin())
      WITH CHECK (public.is_admin());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'delivery_load_items' AND policyname = 'delivery_load_items_picker_own'
  ) THEN
    CREATE POLICY delivery_load_items_picker_own ON public.delivery_load_items
      FOR ALL TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.delivery_loads dl
          WHERE dl.id = delivery_load_items.load_id
            AND dl.picked_by = auth.uid()
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.delivery_loads dl
          WHERE dl.id = delivery_load_items.load_id
            AND dl.picked_by = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'delivery_load_items' AND policyname = 'delivery_load_items_staff_read'
  ) THEN
    CREATE POLICY delivery_load_items_staff_read ON public.delivery_load_items
      FOR SELECT TO authenticated
      USING (public.has_staff_permission('see_invoices'));
  END IF;

  -- stock_audit_alerts: admins full; staff read; pickers can create (handled
  -- through SECURITY DEFINER server actions) and read their own.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'stock_audit_alerts' AND policyname = 'stock_audit_alerts_admin_all'
  ) THEN
    CREATE POLICY stock_audit_alerts_admin_all ON public.stock_audit_alerts
      FOR ALL TO authenticated
      USING (public.is_admin())
      WITH CHECK (public.is_admin());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'stock_audit_alerts' AND policyname = 'stock_audit_alerts_staff_read'
  ) THEN
    CREATE POLICY stock_audit_alerts_staff_read ON public.stock_audit_alerts
      FOR SELECT TO authenticated
      USING (public.has_staff_permission('see_products'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'stock_audit_alerts' AND policyname = 'stock_audit_alerts_picker_own'
  ) THEN
    CREATE POLICY stock_audit_alerts_picker_own ON public.stock_audit_alerts
      FOR SELECT TO authenticated
      USING (auth.uid() = raised_by);
  END IF;
END $$;
