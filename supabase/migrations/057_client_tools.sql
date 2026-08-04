-- =============================================================================
-- Star Hawk Builders Merchant — 057_client_tools.sql
-- =============================================================================
-- Adds client-facing tools inside the portal:
--   1. client_inventory  — what the customer has bought and how much is left
--   2. client_quotes     — authenticated quote requests created by the client
--
-- Idempotency: every CREATE / ADD COLUMN / ALTER is guarded so re-running
-- against an already-migrated DB is a no-op.
-- =============================================================================

-- =============================================================================
-- 1. client_inventory
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.client_inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  quantity_purchased numeric NOT NULL DEFAULT 0,
  quantity_remaining numeric NOT NULL DEFAULT 0,
  reorder_threshold numeric NOT NULL DEFAULT 0,
  last_updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- One inventory row per client + product + invoice source.
CREATE UNIQUE INDEX IF NOT EXISTS idx_client_inventory_unique
  ON public.client_inventory(client_id, product_id, invoice_id);

-- Quick lookups for the portal list and low-stock alerts.
CREATE INDEX IF NOT EXISTS idx_client_inventory_client_id
  ON public.client_inventory(client_id);
CREATE INDEX IF NOT EXISTS idx_client_inventory_low_stock
  ON public.client_inventory(client_id, quantity_remaining, reorder_threshold)
  WHERE quantity_remaining <= reorder_threshold;

COMMENT ON TABLE public.client_inventory IS
  'Post-sale inventory tracked per client. Quantity remaining is updated by the client as stock is used on site.';

-- =============================================================================
-- 2. client_quotes
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.client_quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'quoted', 'ordered', 'rejected', 'cancelled')),
  reference_number text UNIQUE,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  delivery_address jsonb,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_quotes_client_id
  ON public.client_quotes(client_id);

COMMENT ON TABLE public.client_quotes IS
  'Authenticated quote requests submitted by clients through the portal, separate from anonymous public quote_requests.';

-- =============================================================================
-- 3. Row Level Security
-- =============================================================================
ALTER TABLE public.client_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_quotes ENABLE ROW LEVEL SECURITY;

-- Helper: true if the current user is the client linked to the given client_id.
CREATE OR REPLACE FUNCTION public.is_own_client(p_client_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.profiles p
     WHERE p.id = auth.uid()
       AND p.role = 'client'
       AND p.client_id = p_client_id
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_own_client(uuid) TO authenticated;

-- client_inventory policies
DROP POLICY IF EXISTS client_inventory_select ON public.client_inventory;
CREATE POLICY client_inventory_select ON public.client_inventory
  FOR SELECT TO authenticated USING (
    public.is_admin()
    OR public.is_own_client(client_id)
  );

DROP POLICY IF EXISTS client_inventory_insert ON public.client_inventory;
CREATE POLICY client_inventory_insert ON public.client_inventory
  FOR INSERT TO authenticated WITH CHECK (
    public.is_admin()
    OR public.is_own_client(client_id)
  );

DROP POLICY IF EXISTS client_inventory_update ON public.client_inventory;
CREATE POLICY client_inventory_update ON public.client_inventory
  FOR UPDATE TO authenticated USING (
    public.is_admin()
    OR public.is_own_client(client_id)
  );

-- client_quotes policies
DROP POLICY IF EXISTS client_quotes_select ON public.client_quotes;
CREATE POLICY client_quotes_select ON public.client_quotes
  FOR SELECT TO authenticated USING (
    public.is_admin()
    OR public.is_own_client(client_id)
  );

DROP POLICY IF EXISTS client_quotes_insert ON public.client_quotes;
CREATE POLICY client_quotes_insert ON public.client_quotes
  FOR INSERT TO authenticated WITH CHECK (
    public.is_admin()
    OR public.is_own_client(client_id)
  );

DROP POLICY IF EXISTS client_quotes_update ON public.client_quotes;
CREATE POLICY client_quotes_update ON public.client_quotes
  FOR UPDATE TO authenticated USING (
    public.is_admin()
    OR public.is_own_client(client_id)
  );

-- =============================================================================
-- 4. Trigger: seed client_inventory when an invoice is delivered
-- =============================================================================
CREATE OR REPLACE FUNCTION public.seed_client_inventory_from_invoice()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only seed when the invoice reaches a delivered/billed state and is linked to a client.
  IF NEW.client_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.status IN ('sent', 'partial', 'paid') THEN
    INSERT INTO public.client_inventory (
      client_id,
      product_id,
      invoice_id,
      quantity_purchased,
      quantity_remaining,
      reorder_threshold
    )
    SELECT
      NEW.client_id,
      ii.product_id,
      NEW.id,
      ii.quantity,
      ii.quantity,
      0
    FROM public.invoice_items ii
    WHERE ii.invoice_id = NEW.id
      AND ii.product_id IS NOT NULL
    ON CONFLICT (client_id, product_id, invoice_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS invoice_seed_client_inventory ON public.invoices;
CREATE TRIGGER invoice_seed_client_inventory
  AFTER INSERT OR UPDATE OF status ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.seed_client_inventory_from_invoice();

-- =============================================================================
-- 5. Trigger: keep updated_at current
-- =============================================================================
CREATE OR REPLACE FUNCTION public.touch_client_quotes_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS client_quotes_updated_at ON public.client_quotes;
CREATE TRIGGER client_quotes_updated_at
  BEFORE UPDATE ON public.client_quotes
  FOR EACH ROW EXECUTE FUNCTION public.touch_client_quotes_updated_at();
