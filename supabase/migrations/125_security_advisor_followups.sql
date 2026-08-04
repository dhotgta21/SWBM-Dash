-- =============================================================================
-- Migration 125: Security Advisor follow-ups
-- =============================================================================
--
-- Closes the residual items from the database-linter review without breaking
-- any public or staff surface:
--
--   1. verify_deletion_password — add a per-user brute-force throttle. The
--      function is granted to `authenticated` and is called directly by the
--      campaigns delete flow, so any signed-in user could otherwise online-
--      guess the shared deletion password via /rest/v1/rpc with no attempt
--      cap. Now throttled to 20 attempts / 10 min per user (service_role is
--      trusted). Volatility changes STABLE -> VOLATILE because the throttle
--      writes to public.rate_limits.
--
--   2. mark_stock_alert_ordered / receive_stock_alert_goods — add the
--      service_role bypass that reconcile_invoice_stock_from_loads already
--      has. The app calls both via createAdminClient() (service_role, where
--      auth.uid() is NULL); the bare `auth.uid() IS NULL` guard made the
--      goods-in actions raise 'Not authenticated'. No behaviour change for
--      staff callers.
--
--   3. search_products_for_ai / generate_document_number /
--      generate_unique_order_number — block the `client` portal role. These
--      are granted to `authenticated` (which includes portal clients) but are
--      only ever used by staff tools / server actions. service_role bypass
--      preserves the public quote-submission path (adminClient) and all staff
--      (user-client) paths. No grant changes.
--
-- Idempotent: every statement uses CREATE OR REPLACE / REVOKE / GRANT so it is
-- safe to re-run.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. verify_deletion_password — per-user brute-force throttle
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.verify_deletion_password(p_password text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
VOLATILE
AS $$
DECLARE
  v_hash text;
  v_attempts integer;
BEGIN
  -- Throttle direct callers (campaigns delete flow, or any authenticated user
  -- hitting /rest/v1/rpc/verify_deletion_password). service_role is trusted and
  -- skips the counter; unauthenticated callers have no uid to key on and fall
  -- through to the hash check (which simply returns false when no password is
  -- set / the guess is wrong).
  IF auth.role() <> 'service_role' AND auth.uid() IS NOT NULL THEN
    v_attempts := public.check_rate_limit('verify-del-pwd:' || auth.uid()::text, 20, 600);
    IF v_attempts > 20 THEN
      RETURN false;
    END IF;
  END IF;

  SELECT deletion_password_hash INTO v_hash FROM public.app_secrets WHERE id = 1;
  IF v_hash IS NULL THEN
    RETURN false;
  END IF;
  RETURN crypt(p_password, v_hash) = v_hash;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.verify_deletion_password(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.verify_deletion_password(text) TO authenticated, service_role;

COMMENT ON FUNCTION public.verify_deletion_password(text) IS
  'bcrypt compare of the shared deletion password. Per-user throttled (20/10min) because it is callable directly by authenticated users. Locked down in migration 125.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2a. mark_stock_alert_ordered — service_role bypass (app uses adminClient)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mark_stock_alert_ordered(
  p_alert_id uuid,
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
  IF auth.role() <> 'service_role' THEN
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
    END IF;
    IF NOT (
      public.is_admin()
      OR public.has_staff_permission('products_edit')
    ) THEN
      RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
    END IF;
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

REVOKE EXECUTE ON FUNCTION public.mark_stock_alert_ordered(uuid, numeric, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_stock_alert_ordered(uuid, numeric, date, text) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2b. receive_stock_alert_goods — service_role bypass (app uses adminClient)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.receive_stock_alert_goods(
  p_alert_id uuid,
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
  IF auth.role() <> 'service_role' THEN
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
    END IF;
    IF NOT (
      public.is_admin()
      OR public.has_staff_permission('products_edit')
    ) THEN
      RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
    END IF;
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
             stock_updated_by = auth.uid()
       WHERE id = v_alert.product_id;
    END IF;
  END IF;

  UPDATE public.stock_audit_alerts
     SET status = 'received',
         quantity_received = v_qty,
         received_at = now(),
         resolved_at = now(),
         resolved_by = auth.uid(),
         notes = COALESCE(NULLIF(trim(p_notes), ''), notes)
   WHERE id = p_alert_id;

  RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.receive_stock_alert_goods(uuid, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.receive_stock_alert_goods(uuid, numeric, text) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3a. search_products_for_ai — block portal clients (staff / service only)
--     Body is the 123 version verbatim; only the client gate is added.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.search_products_for_ai(
  p_query text,
  p_limit integer DEFAULT 20,
  p_active_only boolean DEFAULT true
)
RETURNS SETOF public.products
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_query text := trim(coalesce(p_query, ''));
  v_fts_query tsquery;
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100);
  v_active_only boolean := COALESCE(p_active_only, true);
BEGIN
  -- Staff invoice-assistant tool: portal clients must not reach it even though
  -- the EXECUTE grant is (necessarily) to the whole `authenticated` role.
  IF auth.role() <> 'service_role' THEN
    IF EXISTS (
      SELECT 1 FROM public.profiles
       WHERE id = auth.uid() AND role = 'client'
    ) THEN
      RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF v_query = '' THEN
    RETURN QUERY EXECUTE
      'SELECT p.* FROM public.products p
       WHERE p.deleted_at IS NULL
         AND (NOT $1 OR p.is_active = true)
         AND NOT COALESCE(p.is_temporary, false)
       ORDER BY p.name
       LIMIT $2'
      USING v_active_only, v_limit;
    RETURN;
  END IF;

  v_fts_query := websearch_to_tsquery('english', v_query);

  CREATE TEMP TABLE IF NOT EXISTS _search_product_ai_results (
    id uuid PRIMARY KEY,
    stage int NOT NULL,
    score numeric NOT NULL
  ) ON COMMIT DROP;

  TRUNCATE _search_product_ai_results;

  EXECUTE '
    INSERT INTO _search_product_ai_results (id, stage, score)
    SELECT p.id, 1, ts_rank_cd(
      (
        setweight(to_tsvector(''english'', coalesce(p.name, '''')), ''A'') ||
        setweight(to_tsvector(''english'', coalesce(p.category, '''')), ''C'') ||
        setweight(to_tsvector(''english'', coalesce(p.brand, '''')), ''C'') ||
        setweight(to_tsvector(''english'', coalesce(public.array_to_text(p.search_tags), '''')), ''C'') ||
        setweight(to_tsvector(''english'', coalesce(p.description, '''')), ''D'') ||
        setweight(to_tsvector(''english'', coalesce(p.short_description, '''')), ''D'') ||
        setweight(to_tsvector(''english'', coalesce(p.seo_title, '''')), ''D'') ||
        setweight(to_tsvector(''english'', coalesce(p.seo_description, '''')), ''D'') ||
        setweight(jsonb_to_tsvector(''english''::regconfig, coalesce(p.key_features, ''[]''::jsonb), ''["string"]''::jsonb), ''D'') ||
        setweight(jsonb_to_tsvector(''english''::regconfig, coalesce(p.applications, ''[]''::jsonb), ''["string"]''::jsonb), ''D'')
      ),
      $1,
      32
    )
    FROM public.products p
    WHERE p.deleted_at IS NULL
      AND (NOT $2 OR p.is_active = true)
      AND NOT COALESCE(p.is_temporary, false)
      AND p.search_document @@ $1
    ON CONFLICT (id) DO NOTHING'
    USING v_fts_query, v_active_only;

  EXECUTE '
    INSERT INTO _search_product_ai_results (id, stage, score)
    SELECT p.id, 2, greatest(
      similarity(p.name, $1),
      similarity(p.category, $1),
      similarity(p.brand, $1),
      similarity(coalesce(public.array_to_text(p.search_tags), ''''), $1),
      similarity(p.description, $1),
      similarity(p.short_description, $1),
      similarity(p.seo_title, $1),
      similarity(p.seo_description, $1)
    )
    FROM public.products p
    WHERE p.deleted_at IS NULL
      AND (NOT $2 OR p.is_active = true)
      AND NOT COALESCE(p.is_temporary, false)
      AND NOT EXISTS (SELECT 1 FROM _search_product_ai_results r WHERE r.id = p.id)
      AND (
        similarity(p.name, $1) > 0.18
        OR similarity(p.category, $1) > 0.18
        OR similarity(p.brand, $1) > 0.18
        OR similarity(coalesce(public.array_to_text(p.search_tags), ''''), $1) > 0.18
        OR similarity(p.description, $1) > 0.18
        OR similarity(p.short_description, $1) > 0.18
        OR similarity(p.seo_title, $1) > 0.18
        OR similarity(p.seo_description, $1) > 0.18
      )
    ON CONFLICT (id) DO NOTHING'
    USING v_query, v_active_only;

  EXECUTE '
    INSERT INTO _search_product_ai_results (id, stage, score)
    SELECT p.id, 3, 0.0
    FROM public.products p
    WHERE p.deleted_at IS NULL
      AND (NOT $2 OR p.is_active = true)
      AND NOT COALESCE(p.is_temporary, false)
      AND NOT EXISTS (SELECT 1 FROM _search_product_ai_results r WHERE r.id = p.id)
      AND (
        p.name ILIKE ''%'' || $1 || ''%''
        OR p.category ILIKE ''%'' || $1 || ''%''
        OR p.brand ILIKE ''%'' || $1 || ''%''
        OR coalesce(public.array_to_text(p.search_tags), '''') ILIKE ''%'' || $1 || ''%''
        OR p.description ILIKE ''%'' || $1 || ''%''
        OR p.short_description ILIKE ''%'' || $1 || ''%''
        OR p.seo_title ILIKE ''%'' || $1 || ''%''
        OR p.seo_description ILIKE ''%'' || $1 || ''%''
      )
    ON CONFLICT (id) DO NOTHING'
    USING v_query, v_active_only;

  RETURN QUERY
    SELECT p.*
    FROM public.products p
    JOIN _search_product_ai_results r ON r.id = p.id
    WHERE p.deleted_at IS NULL
    ORDER BY r.stage, r.score DESC, p.name
    LIMIT v_limit;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.search_products_for_ai(text, integer, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_products_for_ai(text, integer, boolean)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.search_products_for_ai(text, integer, boolean) IS
  'Natural-language product search for the staff invoice AI assistant. Portal-client role blocked in 125; anon revoked; p_limit hard-capped at 100; excludes temporary and soft-deleted products.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3b. generate_document_number — block portal clients (sequence allocator)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.generate_document_number(doc_prefix text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year   integer := extract(year  FROM now())::int;
  v_month  integer := extract(month FROM now())::int;
  v_letter text    := chr(64 + v_month);  -- 1 -> 'A', 2 -> 'B', ... 12 -> 'L'
  v_seq    integer;
BEGIN
  -- Allocators are granted to `authenticated` (which includes portal clients)
  -- but are only consumed by staff actions and the public quote submission
  -- (service_role). Block clients so a portal user cannot burn sequence numbers.
  IF auth.role() <> 'service_role' THEN
    IF EXISTS (
      SELECT 1 FROM public.profiles
       WHERE id = auth.uid() AND role = 'client'
    ) THEN
      RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Ensure a sequence row exists for this prefix + year + month.
  INSERT INTO public.document_sequences (prefix, year, month, current_number)
  VALUES (doc_prefix, v_year, v_month, 0)
  ON CONFLICT (prefix, year, month) DO NOTHING;

  -- Atomically increment and read back the new per-month sequence value.
  UPDATE public.document_sequences
     SET current_number = current_number + 1
   WHERE prefix = doc_prefix
     AND year    = v_year
     AND month   = v_month
  RETURNING current_number INTO v_seq;

  RETURN doc_prefix || '-' || v_year || '-' || v_letter || v_seq;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.generate_document_number(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_document_number(text) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3c. generate_unique_order_number — block portal clients (sequence allocator)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.generate_unique_order_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_attempts int := 0;
  v_candidate text;
BEGIN
  IF auth.role() <> 'service_role' THEN
    IF EXISTS (
      SELECT 1 FROM public.profiles
       WHERE id = auth.uid() AND role = 'client'
    ) THEN
      RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
    END IF;
  END IF;

  LOOP
    v_attempts := v_attempts + 1;

    -- Atomically reserve the next 6-digit number. Wraps at 999999 back
    -- to 100000 (the user-facing format is fixed-width 6 digits).
    UPDATE public.order_number_sequence
       SET next_value = CASE WHEN next_value >= 999999 THEN 100000 ELSE next_value + 1 END
     WHERE id = 1
    RETURNING next_value - 1 INTO STRICT v_candidate;

    v_candidate := lpad(v_candidate::text, 6, '0');

    -- Return immediately if the candidate doesn't already exist. The
    -- partial UNIQUE index from migration step 2 makes this a strict
    -- guarantee under concurrency — the UPDATE above row-locks the
    -- sequence row, so two callers always get distinct numbers.
    EXIT;
  END LOOP;

  RETURN v_candidate;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.generate_unique_order_number() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_unique_order_number() TO authenticated, service_role;
