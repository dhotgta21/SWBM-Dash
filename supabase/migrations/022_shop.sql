-- =============================================================================
-- Star Hawk Builders Merchant — 022_shop.sql
-- =============================================================================
-- Adds the public-facing shopping and quote-request flow:
--
--   1. quote_requests
--        - one row per quote request submitted from the public site
--        - carries the contact details, delivery address, status, and the
--          IP / user-agent of the submitter for abuse tracking
--
--   2. quote_request_items
--        - line items attached to a quote request
--        - snapshots product code/name/unit at submission time so the
--          request stays readable even if the catalog changes later
--
--   3. ip_bans
--        - IPs that have been blocked from submitting quote requests
--        - reason + optional expiry so the ban can be lifted later
--
--   4. ip_email_log
--        - audit trail of (ip, email) pairs from quote submissions
--        - used by record_ip_email() to detect multiple emails from one
--          IP (a strong signal of bot / fraud activity)
--
-- All four tables have RLS enabled but NO policies for anon / authenticated.
-- Reads and writes only happen through the service-role client (the public
-- API endpoint inserts on behalf of anonymous visitors) or through the
-- authenticated admin dashboard. This is the same pattern used by
-- client_invitations in 021.
--
-- Idempotency: every CREATE / ADD COLUMN is guarded so re-running against
-- an already-migrated DB is a no-op.
-- =============================================================================


-- =============================================================================
-- 1. quote_requests
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.quote_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Sequential number in the same style as invoices (QR-2026-A1).
  -- Allocated atomically via public.generate_document_number('QR') at
  -- insert time so concurrent submissions can't collide.
  request_number text NOT NULL UNIQUE,
  client_name text NOT NULL,
  client_email text NOT NULL,
  client_phone text,
  client_company text,
  delivery_address_line_1 text,
  delivery_address_line_2 text,
  delivery_town text,
  delivery_county text,
  delivery_postcode text,
  notes text,
  -- status transitions: pending → reviewed → invoiced (happy path),
  -- or pending → rejected. 'cancelled' is a soft-delete for the
  -- admin's own record-keeping.
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'reviewed', 'invoiced', 'rejected', 'cancelled')),
  ip_address inet NOT NULL,
  user_agent text,
  processed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  processed_at timestamptz,
  -- created_invoice_id is filled when status flips to 'invoiced' so the
  -- admin can jump straight from the request to the invoice it produced.
  created_invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quote_requests_email_created
  ON public.quote_requests (client_email, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_quote_requests_status_created
  ON public.quote_requests (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_quote_requests_ip
  ON public.quote_requests (ip_address);

ALTER TABLE public.quote_requests ENABLE ROW LEVEL SECURITY;

-- Admin dashboard access. Public submissions continue to use the
-- service-role client so anonymous visitors never hit these policies.
DROP POLICY IF EXISTS quote_requests_select ON public.quote_requests;
CREATE POLICY quote_requests_select ON public.quote_requests
  FOR SELECT TO authenticated USING (public.is_admin());
DROP POLICY IF EXISTS quote_requests_insert ON public.quote_requests;
CREATE POLICY quote_requests_insert ON public.quote_requests
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS quote_requests_update ON public.quote_requests;
CREATE POLICY quote_requests_update ON public.quote_requests
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS quote_requests_delete ON public.quote_requests;
CREATE POLICY quote_requests_delete ON public.quote_requests
  FOR DELETE TO authenticated USING (public.is_admin());


-- =============================================================================
-- 2. quote_request_items
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.quote_request_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_request_id uuid NOT NULL REFERENCES public.quote_requests(id) ON DELETE CASCADE,
  -- Product snapshot — the catalog row may be edited, deactivated or
  -- deleted after the request is submitted, but the request must keep
  -- showing exactly what the customer asked for.
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  product_code text NOT NULL,
  product_name text NOT NULL,
  quantity numeric NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit text NOT NULL DEFAULT 'EA',
  -- suggested_price is what the customer saw on the site (or null if
  -- the product had no listed price). The admin can override on review.
  suggested_price numeric,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quote_request_items_request
  ON public.quote_request_items (quote_request_id);

ALTER TABLE public.quote_request_items ENABLE ROW LEVEL SECURITY;

-- Admin dashboard access. Line items are created with their parent
-- request through the service-role client.
DROP POLICY IF EXISTS quote_request_items_select ON public.quote_request_items;
CREATE POLICY quote_request_items_select ON public.quote_request_items
  FOR SELECT TO authenticated USING (public.is_admin());
DROP POLICY IF EXISTS quote_request_items_insert ON public.quote_request_items;
CREATE POLICY quote_request_items_insert ON public.quote_request_items
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS quote_request_items_update ON public.quote_request_items;
CREATE POLICY quote_request_items_update ON public.quote_request_items
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS quote_request_items_delete ON public.quote_request_items;
CREATE POLICY quote_request_items_delete ON public.quote_request_items
  FOR DELETE TO authenticated USING (public.is_admin());


-- =============================================================================
-- 3. ip_bans
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.ip_bans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address inet NOT NULL UNIQUE,
  reason text NOT NULL,
  banned_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  -- Tracks who/what triggered the ban. NULL = automatic, non-NULL = admin.
  banned_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ip_bans_ip_active
  ON public.ip_bans (ip_address)
  WHERE expires_at IS NULL;

ALTER TABLE public.ip_bans ENABLE ROW LEVEL SECURITY;
-- No policies for anon / authenticated. All access via service role.


-- =============================================================================
-- 4. ip_email_log
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.ip_email_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address inet NOT NULL,
  email text NOT NULL,
  -- submission_hash is included so a flood of identical submissions
  -- from one IP can't fill the log. UNIQUE per (ip, email, hour) keeps
  -- the table small while still capturing distinct-email abuse.
  submission_hour timestamptz NOT NULL
    DEFAULT date_trunc('hour', now()),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ip_email_log_unique_per_hour UNIQUE (ip_address, email, submission_hour)
);

CREATE INDEX IF NOT EXISTS idx_ip_email_log_ip_recent
  ON public.ip_email_log (ip_address, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ip_email_log_email_recent
  ON public.ip_email_log (email, created_at DESC);

ALTER TABLE public.ip_email_log ENABLE ROW LEVEL SECURITY;
-- No policies for anon / authenticated. All access via service role.


-- =============================================================================
-- 5. abuse detection + quota functions
-- =============================================================================
-- All three functions are SECURITY DEFINER + search_path pinned to public,
-- so the public-facing API (which uses the service-role client anyway)
-- can call them without needing direct RLS access to the underlying tables.

-- Count quote requests from one email inside a rolling window. Used to
-- enforce the per-email quota.
CREATE OR REPLACE FUNCTION public.count_quote_requests_in_window(
  p_email text,
  p_window_days int DEFAULT 30
)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::int
  FROM public.quote_requests
  WHERE lower(client_email) = lower(p_email)
    AND created_at >= now() - make_interval(days => p_window_days)
    AND status NOT IN ('rejected', 'cancelled');
$$;

-- True when an IP is currently banned (no expiry, or expiry still in
-- the future).
CREATE OR REPLACE FUNCTION public.is_ip_banned(p_ip inet)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.ip_bans
    WHERE ip_address = p_ip
      AND (expires_at IS NULL OR expires_at > now())
  );
$$;

-- Record an (ip, email) submission and detect multi-email abuse from one
-- IP. The threshold is intentionally tight: > 3 distinct emails from one
-- IP in 24 hours means someone is rotating burner emails to dodge the
-- per-email quota.
--
-- Returns the number of *distinct* emails that have submitted from this
-- IP in the last 24 hours (including the one we just logged). The caller
-- compares against the threshold to decide whether to ban.
--
-- Side effect: if the count crosses the threshold AND the IP isn't
-- already banned, the function inserts an ip_bans row automatically.
CREATE OR REPLACE FUNCTION public.record_ip_email(
  p_ip inet,
  p_email text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_distinct_emails int;
  v_already_banned boolean;
  v_threshold constant int := 3;  -- > 3 distinct emails / 24h triggers a ban
BEGIN
  -- Insert one row per (ip, email, hour). The unique constraint dedupes
  -- floods from a single email.
  INSERT INTO public.ip_email_log (ip_address, email)
  VALUES (p_ip, lower(p_email))
  ON CONFLICT (ip_address, email, submission_hour) DO NOTHING;

  -- Count distinct emails from this IP in the last 24 hours.
  SELECT COUNT(DISTINCT lower(email))
    INTO v_distinct_emails
    FROM public.ip_email_log
   WHERE ip_address = p_ip
     AND created_at >= now() - interval '24 hours';

  -- Auto-ban if the threshold is crossed.
  IF v_distinct_emails > v_threshold THEN
    SELECT public.is_ip_banned(p_ip) INTO v_already_banned;
    IF NOT v_already_banned THEN
      INSERT INTO public.ip_bans (ip_address, reason)
      VALUES (
        p_ip,
        format('Auto-ban: %s distinct emails submitted from this IP in the last 24 hours', v_distinct_emails)
      )
      ON CONFLICT (ip_address) DO NOTHING;
    END IF;
  END IF;

  RETURN v_distinct_emails;
END;
$$;

-- Admin: lift an IP ban manually (sets expires_at to the past).
CREATE OR REPLACE FUNCTION public.unban_ip(p_ip inet)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows int;
BEGIN
  UPDATE public.ip_bans
     SET expires_at = now() - interval '1 second'
   WHERE ip_address = p_ip
     AND (expires_at IS NULL OR expires_at > now());
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows > 0;
END;
$$;


-- =============================================================================
-- 6. audit triggers — keep updated_at fresh
-- =============================================================================

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS quote_requests_touch_updated_at ON public.quote_requests;
CREATE TRIGGER quote_requests_touch_updated_at
  BEFORE UPDATE ON public.quote_requests
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


-- =============================================================================
-- 7. GRANTS for quote-request tables
-- =============================================================================
-- RLS policies narrow this to admin users; the grant is needed so the
-- authenticated role can reach the table at all.
GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.quote_requests, public.quote_request_items TO authenticated;
