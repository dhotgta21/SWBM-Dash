-- =============================================================================
-- Star Hawk Builders Merchant — 097_search_products_for_ai.sql
-- =============================================================================
-- Dedicated product search for the AI invoice assistant.
--
-- The general search_products RPC is optimised for staff autocomplete: it
-- heavily weights product codes because operators type codes. The AI assistant
-- receives natural-language descriptions ("20mm gravel", "4x2 timber") where
-- numbers are dimensions, not codes. Searching by code in that context pulls
-- in unrelated products and confuses the model.
--
-- This function therefore:
--   - Searches ONLY name, description, short_description, search_tags,
--     category, brand, mpn, applications and key_features.
--   - Does NOT search or rank by code.
--   - Ranks name matches first, then description/tag similarity.
--   - Always excludes temporary products (AI should never match quick-add rows).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.search_products_for_ai(
  p_query text,
  p_limit integer DEFAULT 20,
  p_active_only boolean DEFAULT true
)
RETURNS SETOF public.products
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_query text := trim(coalesce(p_query, ''));
  v_fts_query tsquery;
BEGIN
  IF v_query = '' THEN
    RETURN QUERY EXECUTE
      'SELECT p.* FROM public.products p
       WHERE (NOT $1 OR p.is_active = true)
         AND NOT p.is_temporary
       ORDER BY p.name
       LIMIT $2'
      USING p_active_only, p_limit;
    RETURN;
  END IF;

  -- Full-text query over the same document used by search_products, but we will
  -- ignore code/MPN matches at ranking time by only using non-code weights.
  v_fts_query := websearch_to_tsquery('english', v_query);

  CREATE TEMP TABLE IF NOT EXISTS _search_product_ai_results (
    id uuid PRIMARY KEY,
    stage int NOT NULL,
    score numeric NOT NULL
  ) ON COMMIT DROP;

  TRUNCATE _search_product_ai_results;

  -- Stage 1: full-text search, but only on non-code fields.
  -- We rank by a document that excludes code/MPN so code hits do not inflate scores.
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
    WHERE (NOT $2 OR p.is_active = true)
      AND NOT p.is_temporary
      AND p.search_document @@ $1
    ON CONFLICT (id) DO NOTHING'
    USING v_fts_query, p_active_only;

  -- Stage 2: trigram similarity fallback on non-code fields only.
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
    WHERE (NOT $2 OR p.is_active = true)
      AND NOT p.is_temporary
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
    USING v_query, p_active_only;

  -- Stage 3: substring fallback on non-code fields only.
  EXECUTE '
    INSERT INTO _search_product_ai_results (id, stage, score)
    SELECT p.id, 3, 0.0
    FROM public.products p
    WHERE (NOT $2 OR p.is_active = true)
      AND NOT p.is_temporary
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
    USING v_query, p_active_only;

  RETURN QUERY
    SELECT p.*
    FROM public.products p
    JOIN _search_product_ai_results r ON r.id = p.id
    ORDER BY r.stage, r.score DESC, p.name
    LIMIT p_limit;
END;
$$;
