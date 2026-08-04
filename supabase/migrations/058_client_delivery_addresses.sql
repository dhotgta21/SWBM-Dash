-- =============================================================================
-- Star Hawk Builders Merchant — 058_client_delivery_addresses.sql
-- =============================================================================
-- Lets clients save and manage multiple delivery addresses (job sites, yard,
-- office, etc.) under their account.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.client_delivery_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  label text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  address_line_1 text NOT NULL,
  address_line_2 text,
  town text NOT NULL,
  county text,
  postcode text NOT NULL,
  contact_name text,
  contact_phone text,
  delivery_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_delivery_addresses_client_id
  ON public.client_delivery_addresses(client_id);

-- Only one default address per client.
CREATE UNIQUE INDEX IF NOT EXISTS idx_client_delivery_addresses_one_default
  ON public.client_delivery_addresses(client_id)
  WHERE is_default = true;

COMMENT ON TABLE public.client_delivery_addresses IS
  'Saved delivery addresses for client accounts (job sites, offices, yards). Managed by the client through the portal.';

-- Row Level Security
ALTER TABLE public.client_delivery_addresses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS client_delivery_addresses_select ON public.client_delivery_addresses;
CREATE POLICY client_delivery_addresses_select ON public.client_delivery_addresses
  FOR SELECT TO authenticated USING (
    public.is_admin()
    OR public.is_own_client(client_id)
  );

DROP POLICY IF EXISTS client_delivery_addresses_insert ON public.client_delivery_addresses;
CREATE POLICY client_delivery_addresses_insert ON public.client_delivery_addresses
  FOR INSERT TO authenticated WITH CHECK (
    public.is_admin()
    OR public.is_own_client(client_id)
  );

DROP POLICY IF EXISTS client_delivery_addresses_update ON public.client_delivery_addresses;
CREATE POLICY client_delivery_addresses_update ON public.client_delivery_addresses
  FOR UPDATE TO authenticated USING (
    public.is_admin()
    OR public.is_own_client(client_id)
  );

DROP POLICY IF EXISTS client_delivery_addresses_delete ON public.client_delivery_addresses;
CREATE POLICY client_delivery_addresses_delete ON public.client_delivery_addresses
  FOR DELETE TO authenticated USING (
    public.is_admin()
    OR public.is_own_client(client_id)
  );

-- Trigger: keep updated_at current
CREATE OR REPLACE FUNCTION public.touch_client_delivery_addresses_updated_at()
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

DROP TRIGGER IF EXISTS client_delivery_addresses_updated_at ON public.client_delivery_addresses;
CREATE TRIGGER client_delivery_addresses_updated_at
  BEFORE UPDATE ON public.client_delivery_addresses
  FOR EACH ROW EXECUTE FUNCTION public.touch_client_delivery_addresses_updated_at();
