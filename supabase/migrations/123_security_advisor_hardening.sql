-- =============================================================================
-- Migration 123: Security Advisor hardening (no-break public surfaces)
-- =============================================================================
--
-- Implements the approved security plan phases 1, 2, and 4:
--   A. Grant hygiene for DEFINER / trigger functions recreated after 117
--   B. Split products SELECT RLS: catalogue-safe for anon, full for staff
--   C. Harden search_products for anon callers (force public-safe filters +
--      always exclude soft-deleted rows)
--   D. Lock down search_products_for_ai (staff/service only, limit clamp,
--      soft-delete filter)
--
-- Public catalogue search, shop pages, and invoice share links stay public.
-- No browser "frontend fingerprint" token is introduced (see runbook).
--
-- Idempotent: safe to re-run.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- A. Grant hygiene — trigger-only + post-117 staff RPCs
--    Postgres grants EXECUTE to PUBLIC by default; CREATE OR REPLACE does not
--    always clear that. Re-assert least privilege.
-- ─────────────────────────────────────────────────────────────────────────────

-- Trigger-only: never callable via PostgREST by clients.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'recompute_invoice_paid',
        'handle_invoice_stock_on_insert',
        'handle_invoice_stock_on_delete',
        'handle_invoice_stock_on_status_change',
        'enforce_profile_update_scope'
      )
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
    -- Triggers run as owner; service_role grant is for manual repair only.
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;
END $$;

-- Staff stock / wallet / invoice RPCs: authenticated + service_role, never anon.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'adjust_invoice_item_stock',
        'deduct_invoice_stock',
        'restore_invoice_stock',
        'raise_low_stock_alerts',
        'reconcile_invoice_stock_from_loads',
        'mark_stock_alert_ordered',
        'receive_stock_alert_goods',
        'deposit_to_client_account',
        'apply_client_account_balance',
        'log_client_account_action',
        'soft_delete_client',
        'soft_delete_product',
        'soft_delete_invoice',
        'soft_delete_payment',
        'restore_client',
        'restore_product',
        'restore_invoice',
        'hard_delete_draft_invoice',
        'set_deletion_password',
        'change_deletion_password',
        'verify_deletion_password',
        'generate_document_number',
        'generate_unique_order_number',
        'has_staff_permission',
        'is_admin',
        'is_client_of_invoice',
        'is_own_client',
        'replace_company_contact_channels',
        'update_invoice_with_items'
      )
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;
END $$;

-- Service-role-only helpers (must not be staff-callable over PostgREST).
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'save_pick_state',
        'cleanup_stale_draft_invoices',
        'cleanup_stale_quote_requests',
        'get_deletion_password_hash',
        'log_deletion_event',
        'user_can_delete_client',
        'user_can_delete_product',
        'user_can_delete_invoice',
        'user_can_delete_payment'
      )
  LOOP
    EXECUTE format(
      'REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated',
      r.sig
    );
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;
END $$;

-- Intentional public RPCs: re-assert exact grants (idempotent).
REVOKE EXECUTE ON FUNCTION public.check_rate_limit(text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, integer, integer) TO anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.search_products(text, integer, boolean, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_products(text, integer, boolean, boolean) TO anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- B. Products SELECT RLS — catalogue-safe for anon; full for authenticated
--    Previous policy (028): FOR SELECT USING (true) for all roles.
--    Rollback snippet (restore only):
--      DROP POLICY IF EXISTS products_select_anon ON public.products;
--      DROP POLICY IF EXISTS products_select_authenticated ON public.products;
--      CREATE POLICY products_select ON public.products FOR SELECT USING (true);
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS products_select ON public.products;
DROP POLICY IF EXISTS products_select_anon ON public.products;
DROP POLICY IF EXISTS products_select_authenticated ON public.products;

-- Anonymous visitors: active catalogue only (matches public shop filters).
CREATE POLICY products_select_anon ON public.products
  FOR SELECT
  TO anon
  USING (
    deleted_at IS NULL
    AND is_active = true
    AND COALESCE(is_temporary, false) = false
  );

-- Signed-in users (staff / client / picker): keep pre-change breadth so
-- dashboards can still see inactive, temporary, and soft-deleted rows.
CREATE POLICY products_select_authenticated ON public.products
  FOR SELECT
  TO authenticated
  USING (true);

-- Table privilege required; RLS enforces row filter for anon.
GRANT SELECT ON public.products TO anon;
GRANT SELECT ON public.products TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- C. Harden search_products for anon callers
--    SECURITY DEFINER bypasses RLS, so we must enforce public-safe filters
--    inside the function when role = anon. Always exclude soft-deleted rows.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.search_products(
  p_query text,
  p_limit integer DEFAULT 20,
  p_active_only boolean DEFAULT true,
  p_exclude_temporary boolean DEFAULT true
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
  v_exclude_temporary boolean := COALESCE(p_exclude_temporary, true);
  v_temp_filter text;
BEGIN
  -- Anon (public shop / direct PostgREST) cannot opt into inactive or temporary.
  IF auth.role() = 'anon' THEN
    v_active_only := true;
    v_exclude_temporary := true;
  END IF;

  v_temp_filter := CASE WHEN v_exclude_temporary
    THEN ' AND NOT COALESCE(p.is_temporary, false)'
    ELSE '' END;

  IF v_query = '' THEN
    RETURN QUERY EXECUTE
      'SELECT p.* FROM public.products p
       WHERE p.deleted_at IS NULL
         AND (NOT $1 OR p.is_active = true)' || v_temp_filter || '
       ORDER BY p.name
       LIMIT $2'
      USING v_active_only, v_limit;
    RETURN;
  END IF;

  v_fts_query := websearch_to_tsquery('english', v_query);

  CREATE TEMP TABLE IF NOT EXISTS _search_product_results (
    id uuid PRIMARY KEY,
    stage int NOT NULL,
    score numeric NOT NULL
  ) ON COMMIT DROP;

  TRUNCATE _search_product_results;

  EXECUTE '
    INSERT INTO _search_product_results (id, stage, score)
    SELECT p.id, 1, ts_rank_cd(p.search_document, $1, 32)
    FROM public.products p
    WHERE p.deleted_at IS NULL
      AND (NOT $2 OR p.is_active = true)' || v_temp_filter || '
      AND p.search_document @@ $1
    ON CONFLICT (id) DO NOTHING'
    USING v_fts_query, v_active_only;

  EXECUTE '
    INSERT INTO _search_product_results (id, stage, score)
    SELECT p.id, 2, greatest(
      similarity(p.name, $1),
      similarity(p.code, $1),
      similarity(p.category, $1),
      similarity(p.brand, $1),
      similarity(coalesce(public.array_to_text(p.search_tags), ''''), $1),
      similarity(p.description, $1)
    )
    FROM public.products p
    WHERE p.deleted_at IS NULL
      AND (NOT $2 OR p.is_active = true)' || v_temp_filter || '
      AND NOT EXISTS (SELECT 1 FROM _search_product_results r WHERE r.id = p.id)
      AND (
        similarity(p.name, $1) > 0.18
        OR similarity(p.code, $1) > 0.18
        OR similarity(p.category, $1) > 0.18
        OR similarity(p.brand, $1) > 0.18
        OR similarity(coalesce(public.array_to_text(p.search_tags), ''''), $1) > 0.18
        OR similarity(p.description, $1) > 0.18
      )
    ON CONFLICT (id) DO NOTHING'
    USING v_query, v_active_only;

  EXECUTE '
    INSERT INTO _search_product_results (id, stage, score)
    SELECT p.id, 3, 0.0
    FROM public.products p
    WHERE p.deleted_at IS NULL
      AND (NOT $2 OR p.is_active = true)' || v_temp_filter || '
      AND NOT EXISTS (SELECT 1 FROM _search_product_results r WHERE r.id = p.id)
      AND (
        p.name ILIKE ''%'' || $1 || ''%''
        OR p.code ILIKE ''%'' || $1 || ''%''
        OR coalesce(public.array_to_text(p.search_tags), '''') ILIKE ''%'' || $1 || ''%''
        OR p.description ILIKE ''%'' || $1 || ''%''
      )
    ON CONFLICT (id) DO NOTHING'
    USING v_query, v_active_only;

  RETURN QUERY
    SELECT p.*
    FROM public.products p
    JOIN _search_product_results r ON r.id = p.id
    WHERE p.deleted_at IS NULL
    ORDER BY r.stage, r.score DESC, p.name
    LIMIT v_limit;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.search_products(text, integer, boolean, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_products(text, integer, boolean, boolean) TO anon, authenticated;

COMMENT ON FUNCTION public.search_products(text, integer, boolean, boolean) IS
  'Catalogue search. Public (anon) callers are forced to active, non-temporary, non-deleted rows; p_limit hard-capped at 100.';

-- ─────────────────────────────────────────────────────────────────────────────
-- D. search_products_for_ai — staff / service only (invoice assistant)
--    Not a public shop surface. Revoke anon; clamp limit; exclude deleted.
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
  'Natural-language product search for the staff invoice AI assistant. Not public; p_limit hard-capped at 100; excludes temporary and soft-deleted products.';
