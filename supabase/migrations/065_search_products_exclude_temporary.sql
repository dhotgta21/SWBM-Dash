-- =============================================================================
-- Star Hawk Builders Merchant — 065_search_products_exclude_temporary.sql
-- =============================================================================
-- Migration 064 introduced temporary products (is_temporary=true) — quick-add
-- rows from inside an invoice/quote that have not yet been completed. They are
-- stamped is_active=true on creation so they continue to appear in the
-- internal ProductSearch autocomplete (lets staff re-pick the same temp
-- product for follow-up invoices), but they MUST NOT leak to the public
-- /quote catalogue or to the dashboard /products search list.
--
-- The search_products RPC (last redefined in 061_product_search_tags.sql) did
-- not know about is_temporary. This migration adds a p_exclude_temporary
-- boolean parameter, default true, so existing callers behave correctly
-- without any code change. The internal ProductSearch picker is updated to
-- pass p_exclude_temporary=false so staff can keep re-picking temp products
-- while they're working through an order.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.search_products(
  p_query text,
  p_limit integer DEFAULT 20,
  p_active_only boolean DEFAULT true,
  p_exclude_temporary boolean DEFAULT true
)
RETURNS SETOF public.products
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_query text := trim(coalesce(p_query, ''));
  v_fts_query tsquery;
  v_temp_filter text := CASE WHEN p_exclude_temporary
    THEN ' AND NOT p.is_temporary'
    ELSE '' END;
BEGIN
  IF v_query = '' THEN
    RETURN QUERY EXECUTE
      'SELECT p.* FROM public.products p
       WHERE (NOT $1 OR p.is_active = true)' || v_temp_filter || '
       ORDER BY p.name
       LIMIT $2'
      USING p_active_only, p_limit;
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
    WHERE (NOT $2 OR p.is_active = true)' || v_temp_filter || '
      AND p.search_document @@ $1
    ON CONFLICT (id) DO NOTHING'
    USING v_fts_query, p_active_only;

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
    WHERE (NOT $2 OR p.is_active = true)' || v_temp_filter || '
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
    USING v_query, p_active_only;

  EXECUTE '
    INSERT INTO _search_product_results (id, stage, score)
    SELECT p.id, 3, 0.0
    FROM public.products p
    WHERE (NOT $2 OR p.is_active = true)' || v_temp_filter || '
      AND NOT EXISTS (SELECT 1 FROM _search_product_results r WHERE r.id = p.id)
      AND (
        p.name ILIKE ''%'' || $1 || ''%''
        OR p.code ILIKE ''%'' || $1 || ''%''
        OR coalesce(public.array_to_text(p.search_tags), '''') ILIKE ''%'' || $1 || ''%''
        OR p.description ILIKE ''%'' || $1 || ''%''
      )
    ON CONFLICT (id) DO NOTHING'
    USING v_query, p_active_only;

  RETURN QUERY
    SELECT p.*
    FROM public.products p
    JOIN _search_product_results r ON r.id = p.id
    ORDER BY r.stage, r.score DESC, p.name
    LIMIT p_limit;
END;
$$;
