-- =============================================================================
-- 060_product_fuzzy_search.sql
-- Hybrid product search: full-text search + pg_trgm trigram similarity.
-- Enables typo-tolerant, description-aware product search for staff, the public
-- shop and the AI invoice assistant.
-- =============================================================================

-- 1. Trigram extension (used for fuzzy matching).
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 2. Generated full-text search document over all product text fields.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS search_document tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(code, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(mpn, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(category, '')), 'C') ||
    setweight(to_tsvector('english', coalesce(brand, '')), 'C') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'D') ||
    setweight(to_tsvector('english', coalesce(short_description, '')), 'D') ||
    setweight(to_tsvector('english', coalesce(seo_title, '')), 'D') ||
    setweight(to_tsvector('english', coalesce(seo_description, '')), 'D') ||
    setweight(jsonb_to_tsvector('english'::regconfig, coalesce(key_features, '[]'::jsonb), '["string"]'::jsonb), 'D') ||
    setweight(jsonb_to_tsvector('english'::regconfig, coalesce(applications, '[]'::jsonb), '["string"]'::jsonb), 'D')
  ) STORED;

-- 3. GIN indexes for fast full-text and trigram searches.
CREATE INDEX IF NOT EXISTS idx_products_search_document
  ON public.products USING GIN(search_document);

CREATE INDEX IF NOT EXISTS idx_products_name_trgm
  ON public.products USING GIN(name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_products_code_trgm
  ON public.products USING GIN(code gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_products_category_trgm
  ON public.products USING GIN(category gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_products_brand_trgm
  ON public.products USING GIN(brand gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_products_description_trgm
  ON public.products USING GIN(description gin_trgm_ops);

-- 4. Ranked search function used by the app via RPC.
CREATE OR REPLACE FUNCTION public.search_products(
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
    RETURN QUERY
    SELECT p.*
    FROM public.products p
    WHERE (NOT p_active_only OR p.is_active = true)
    ORDER BY p.name
    LIMIT p_limit;
    RETURN;
  END IF;

  v_fts_query := websearch_to_tsquery('english', v_query);

  -- Use a session-local temp table to collect IDs found by each stage so we
  -- can deduplicate and rank across FTS, trigram and substring matches.
  CREATE TEMP TABLE IF NOT EXISTS _search_product_results (
    id uuid PRIMARY KEY,
    stage int NOT NULL,
    score numeric NOT NULL
  ) ON COMMIT DROP;

  TRUNCATE _search_product_results;

  -- Stage A: full-text search. Highest rank for natural language / descriptions.
  INSERT INTO _search_product_results (id, stage, score)
  SELECT p.id, 1, ts_rank_cd(p.search_document, v_fts_query, 32)
  FROM public.products p
  WHERE (NOT p_active_only OR p.is_active = true)
    AND p.search_document @@ v_fts_query
  ON CONFLICT (id) DO NOTHING;

  -- Stage B: trigram similarity fallback for typos and partial words.
  -- We use an explicit similarity threshold because the % operator relies on
  -- a session setting that is not always respected by connection pools.
  INSERT INTO _search_product_results (id, stage, score)
  SELECT p.id, 2, greatest(
    similarity(p.name, v_query),
    similarity(p.code, v_query),
    similarity(p.category, v_query),
    similarity(p.brand, v_query),
    similarity(p.description, v_query)
  )
  FROM public.products p
  WHERE (NOT p_active_only OR p.is_active = true)
    AND NOT EXISTS (
      SELECT 1 FROM _search_product_results r WHERE r.id = p.id
    )
    AND (
      similarity(p.name, v_query) > 0.15
      OR similarity(p.code, v_query) > 0.15
      OR similarity(p.category, v_query) > 0.15
      OR similarity(p.brand, v_query) > 0.15
      OR similarity(p.description, v_query) > 0.15
    )
  ON CONFLICT (id) DO NOTHING;

  -- Stage C: substring safety net for anything still missing.
  INSERT INTO _search_product_results (id, stage, score)
  SELECT p.id, 3, 0.0
  FROM public.products p
  WHERE (NOT p_active_only OR p.is_active = true)
    AND NOT EXISTS (
      SELECT 1 FROM _search_product_results r WHERE r.id = p.id
    )
    AND (
      p.name ILIKE '%' || v_query || '%'
      OR p.code ILIKE '%' || v_query || '%'
      OR p.description ILIKE '%' || v_query || '%'
    )
  ON CONFLICT (id) DO NOTHING;

  -- Return results ordered by stage (FTS first), then score, then name.
  RETURN QUERY
  SELECT p.*
  FROM public.products p
  JOIN _search_product_results r ON r.id = p.id
  ORDER BY r.stage, r.score DESC, p.name
  LIMIT p_limit;
END;
$$;

-- 5. Let anonymous visitors and authenticated staff call the function.
GRANT EXECUTE ON FUNCTION public.search_products(text, integer, boolean) TO anon, authenticated;
