-- =============================================================================
-- 061_product_search_tags.sql
-- Add search_tags to products and fold them into the hybrid search.
-- =============================================================================

-- 1. Helper to flatten text arrays inside generated columns (must be IMMUTABLE).
CREATE OR REPLACE FUNCTION public.array_to_text(p_tags text[])
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT string_agg(x, ' ') FROM unnest(coalesce(p_tags, ARRAY[]::text[])) x;
$$;

-- 2. Search tags column.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS search_tags text[] NOT NULL DEFAULT '{}';

-- 2. Recreate the full-text document so it includes search_tags.
ALTER TABLE public.products
  DROP COLUMN IF EXISTS search_document;

ALTER TABLE public.products
  ADD COLUMN search_document tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(code, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(mpn, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(category, '')), 'C') ||
    setweight(to_tsvector('english', coalesce(brand, '')), 'C') ||
    setweight(to_tsvector('english', coalesce(public.array_to_text(search_tags), '')), 'C') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'D') ||
    setweight(to_tsvector('english', coalesce(short_description, '')), 'D') ||
    setweight(to_tsvector('english', coalesce(seo_title, '')), 'D') ||
    setweight(to_tsvector('english', coalesce(seo_description, '')), 'D') ||
    setweight(jsonb_to_tsvector('english'::regconfig, coalesce(key_features, '[]'::jsonb), '["string"]'::jsonb), 'D') ||
    setweight(jsonb_to_tsvector('english'::regconfig, coalesce(applications, '[]'::jsonb), '["string"]'::jsonb), 'D')
  ) STORED;

-- 3. Recreate the full-text GIN index.
CREATE INDEX IF NOT EXISTS idx_products_search_document
  ON public.products USING GIN(search_document);

-- 4. Recreate the search function so trigram / substring checks also use tags.
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

  CREATE TEMP TABLE IF NOT EXISTS _search_product_results (
    id uuid PRIMARY KEY,
    stage int NOT NULL,
    score numeric NOT NULL
  ) ON COMMIT DROP;

  TRUNCATE _search_product_results;

  INSERT INTO _search_product_results (id, stage, score)
  SELECT p.id, 1, ts_rank_cd(p.search_document, v_fts_query, 32)
  FROM public.products p
  WHERE (NOT p_active_only OR p.is_active = true)
    AND p.search_document @@ v_fts_query
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO _search_product_results (id, stage, score)
  SELECT p.id, 2, greatest(
    similarity(p.name, v_query),
    similarity(p.code, v_query),
    similarity(p.category, v_query),
    similarity(p.brand, v_query),
    similarity(coalesce(public.array_to_text(p.search_tags), ''), v_query),
    similarity(p.description, v_query)
  )
  FROM public.products p
  WHERE (NOT p_active_only OR p.is_active = true)
    AND NOT EXISTS (
      SELECT 1 FROM _search_product_results r WHERE r.id = p.id
    )
    AND (
      similarity(p.name, v_query) > 0.18
      OR similarity(p.code, v_query) > 0.18
      OR similarity(p.category, v_query) > 0.18
      OR similarity(p.brand, v_query) > 0.18
      OR similarity(coalesce(public.array_to_text(p.search_tags), ''), v_query) > 0.18
      OR similarity(p.description, v_query) > 0.18
    )
  ON CONFLICT (id) DO NOTHING;

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
      OR coalesce(public.array_to_text(p.search_tags), '') ILIKE '%' || v_query || '%'
      OR p.description ILIKE '%' || v_query || '%'
    )
  ON CONFLICT (id) DO NOTHING;

  RETURN QUERY
  SELECT p.*
  FROM public.products p
  JOIN _search_product_results r ON r.id = p.id
  ORDER BY r.stage, r.score DESC, p.name
  LIMIT p_limit;
END;
$$;

-- 5. Populate search tags for existing products.
UPDATE public.products SET search_tags = ARRAY['dpc', 'damp proof course']::text[] WHERE code = '450' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['dpc', 'damp proof course']::text[] WHERE code = '600' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['mortar admixture', 'mortar plasticizer']::text[] WHERE code = 'ADMIX' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['cement', 'portland cement', 'general purpose cement']::text[] WHERE code = 'AGG-001' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['sand', 'sharp sand', 'grit sand']::text[] WHERE code = 'AGG-002' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['sand', 'rendering sand']::text[] WHERE code = 'AGG-003' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['mot type 1', 'hardcore', 'sub base', 'sub-base']::text[] WHERE code = 'AGG-004' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['sand', 'building sand', 'soft sand']::text[] WHERE code = 'AGG-005' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['gravel', 'shingle', 'decorative stone', 'aggregate', 'pea shingle']::text[] WHERE code = 'AGG-006' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['gravel', 'aggregate', 'ballast', 'all in ballast']::text[] WHERE code = 'AGG-007' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['gravel', 'shingle', 'decorative stone', 'aggregate', 'pea shingle']::text[] WHERE code = 'AGG-008' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['sand', 'plaster sand']::text[] WHERE code = 'AGG-009' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['block', 'building block', 'dense block', 'concrete block', 'solid block']::text[] WHERE code = 'BLO-001' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['block', 'building block', 'dense block', 'concrete block', 'solid block', 'medium dense block']::text[] WHERE code = 'BLO-002' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['block', 'building block', 'hollow block', 'concrete block']::text[] WHERE code = 'BLO-003' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['block', 'building block', 'thermalite', 'aircrete', 'lightweight block']::text[] WHERE code = 'BLO-004' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['brick', 'facing brick']::text[] WHERE code = 'BRI-001' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['brick', 'facing brick', 'stock brick']::text[] WHERE code = 'BRI-002' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['brick', 'facing brick']::text[] WHERE code = 'BRI-004' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['brick', 'facing brick']::text[] WHERE code = 'BRI-005' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['brick', 'facing brick', 'stock brick']::text[] WHERE code = 'BRI-006' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['brick', 'facing brick']::text[] WHERE code = 'BRI-007' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['brick', 'facing brick']::text[] WHERE code = 'BRI-008' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['brick', 'facing brick']::text[] WHERE code = 'BRI-009' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['brick', 'facing brick']::text[] WHERE code = 'BRI-011' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['brick', 'facing brick', 'engineering brick']::text[] WHERE code = 'BRI-012' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['brick', 'facing brick']::text[] WHERE code = 'BRI-013' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['brick', 'facing brick']::text[] WHERE code = 'BRI-014' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['brick', 'facing brick']::text[] WHERE code = 'BRI-015' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['brick', 'facing brick']::text[] WHERE code = 'BRI-016' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['brick', 'facing brick', 'common brick']::text[] WHERE code = 'BRI-017' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['brick', 'facing brick']::text[] WHERE code = 'BRI-018' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['brick', 'facing brick']::text[] WHERE code = 'BRI-019' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['brick', 'facing brick']::text[] WHERE code = 'BRI-020' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['brick', 'facing brick']::text[] WHERE code = 'BRI-021' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['brick', 'facing brick']::text[] WHERE code = 'BRI-022' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['brick', 'facing brick']::text[] WHERE code = 'BRI-023' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['brick', 'facing brick']::text[] WHERE code = 'BRI-024' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['brick', 'facing brick']::text[] WHERE code = 'BRI-025' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['brick', 'facing brick']::text[] WHERE code = 'BRI-026' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['brick', 'facing brick']::text[] WHERE code = 'BRI-028' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['brick', 'facing brick']::text[] WHERE code = 'BRI-029' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['brick', 'facing brick']::text[] WHERE code = 'BRI-030' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['brick', 'facing brick']::text[] WHERE code = 'BRI-031' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['brick', 'facing brick']::text[] WHERE code = 'BRI-032' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['brick', 'facing brick']::text[] WHERE code = 'BRI-033' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['brick']::text[] WHERE code = 'BRICK' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['insulation', 'breathable membrane', 'roof membrane']::text[] WHERE code = 'CAV-001' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['insulation', 'acoustic insulation', 'sound insulation']::text[] WHERE code = 'CAV-003' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['insulation', 'loft insulation', 'insulation roll']::text[] WHERE code = 'CAV-004' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['insulation', 'cavity insulation', 'wall insulation']::text[] WHERE code = 'CAV-006' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['insulation', 'cavity insulation', 'wall insulation']::text[] WHERE code = 'CAV-007' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['insulation', 'cavity insulation', 'wall insulation']::text[] WHERE code = 'CAV-008' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['dpc', 'damp proof course']::text[] WHERE code = 'DPC' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['dpc', 'damp proof course']::text[] WHERE code = 'DPC-150' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['dpc', 'damp proof course']::text[] WHERE code = 'DPC-200' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['dpc', 'damp proof course']::text[] WHERE code = 'DPC-225' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['dpc', 'damp proof course']::text[] WHERE code = 'DPC-300' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['wall ties', 'cavity ties']::text[] WHERE code = 'FIX-001' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['wall ties', 'cavity ties']::text[] WHERE code = 'FIX-002' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['restraint strap']::text[] WHERE code = 'FIX-003' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['brick reinforcement', 'mesh']::text[] WHERE code = 'FIX-004' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['gallows bracket']::text[] WHERE code = 'FIX-005' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['fixing band']::text[] WHERE code = 'FIX-006' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['wall starter']::text[] WHERE code = 'FIX-007' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['joist hanger']::text[] WHERE code = 'FIX-008' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['screws']::text[] WHERE code = 'FIX-009' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['screws']::text[] WHERE code = 'FIX-010' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['screws']::text[] WHERE code = 'FIX-011' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['screws']::text[] WHERE code = 'FIX-012' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['nails']::text[] WHERE code = 'FIX-013' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['nails']::text[] WHERE code = 'FIX-014' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['nails', 'joist hanger']::text[] WHERE code = 'FIX-015' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['screws']::text[] WHERE code = 'FIX-016' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['insulation', 'eps insulation', 'polystyrene insulation']::text[] WHERE code = 'PIR-001' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['insulation', 'pir insulation', 'rigid insulation', 'foam board']::text[] WHERE code = 'PIR-003' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['insulation', 'pir insulation', 'rigid insulation', 'foam board']::text[] WHERE code = 'PIR-004' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['insulation', 'pir insulation', 'rigid insulation', 'foam board']::text[] WHERE code = 'PIR-005' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['insulation', 'pir insulation', 'rigid insulation', 'foam board']::text[] WHERE code = 'PIR-006' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['insulation', 'pir insulation', 'rigid insulation', 'foam board']::text[] WHERE code = 'PIR-007' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['insulation', 'pir insulation', 'rigid insulation', 'foam board']::text[] WHERE code = 'PIR-008' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['plasterboard', 'plaster board', 'drywall', 'gypsum board', 'hardwall plaster', 'plaster']::text[] WHERE code = 'PLA-001' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['plasterboard', 'plaster board', 'drywall', 'gypsum board', 'bonding coat', 'plaster']::text[] WHERE code = 'PLA-002' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['plasterboard', 'plaster board', 'drywall', 'gypsum board', 'multifinish', 'finish plaster']::text[] WHERE code = 'PLA-003' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['plasterboard', 'plaster board', 'drywall', 'gypsum board', 'insulated plasterboard', 'thermal board']::text[] WHERE code = 'PLA-004' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['plasterboard', 'plaster board', 'drywall', 'gypsum board', 'moisture resistant plasterboard', 'green board', 'bathroom plasterboard']::text[] WHERE code = 'PLA-005' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['plasterboard', 'plaster board', 'drywall', 'gypsum board', 'acoustic plasterboard', 'sound board']::text[] WHERE code = 'PLA-006' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['plasterboard', 'plaster board', 'drywall', 'gypsum board', 'fire rated plasterboard', 'fire board']::text[] WHERE code = 'PLA-007' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['plasterboard', 'plaster board', 'drywall', 'gypsum board', 'standard plasterboard']::text[] WHERE code = 'PLA-008' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['fascia', 'fascia board', 'fascia and soffit']::text[] WHERE code = 'ROO-001' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['gutter', 'guttering', 'rainwater', 'upvc gutter']::text[] WHERE code = 'ROO-002' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['fascia', 'fascia board', 'fascia and soffit', 'gutter', 'guttering', 'rainwater', 'upvc gutter']::text[] WHERE code = 'ROO-003' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['roofing felt', 'bitumen felt', 'torch on felt']::text[] WHERE code = 'ROO-004' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['roofing felt', 'bitumen felt', 'torch on felt']::text[] WHERE code = 'ROO-005' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['dpc', 'damp proof course']::text[] WHERE code = 'ROO-006' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['dpm', 'damp proof membrane']::text[] WHERE code = 'ROO-007' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['grp', 'fibreglass roofing', 'flat roof']::text[] WHERE code = 'ROO-008' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['grp', 'fibreglass roofing', 'flat roof']::text[] WHERE code = 'ROO-009' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['grp', 'fibreglass roofing', 'flat roof']::text[] WHERE code = 'ROO-010' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['grp', 'fibreglass roofing', 'flat roof']::text[] WHERE code = 'ROO-011' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['grp', 'fibreglass roofing', 'flat roof']::text[] WHERE code = 'ROO-012' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['grp', 'fibreglass roofing', 'flat roof']::text[] WHERE code = 'ROO-013' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['grp', 'fibreglass roofing', 'flat roof']::text[] WHERE code = 'ROO-014' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['grp', 'fibreglass roofing', 'flat roof']::text[] WHERE code = 'ROO-015' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['grp', 'fibreglass roofing', 'flat roof']::text[] WHERE code = 'ROO-016' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['osb', 'osb board', 'osb3', 'oriented strand board', 'plywood', 'ply', 'sheet board']::text[] WHERE code = 'SHE-001' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['chipboard', 'chipboard flooring', 'flooring board']::text[] WHERE code = 'SHE-003' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['plywood', 'ply', 'sheet board', 'shuttering plywood', 'shuttering ply', 'formwork plywood']::text[] WHERE code = 'SHE-004' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['plywood', 'ply', 'sheet board', 'wbp plywood', 'exterior plywood']::text[] WHERE code = 'SHE-005' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['osb', 'osb board', 'osb3', 'oriented strand board']::text[] WHERE code = 'SHE-006' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['osb', 'osb board', 'osb3', 'oriented strand board', 'plywood', 'ply', 'sheet board']::text[] WHERE code = 'SHE-007' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['plywood', 'ply', 'sheet board', 'wbp plywood', 'exterior plywood']::text[] WHERE code = 'SHE-008' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['chipboard', 'chipboard flooring', 'flooring board']::text[] WHERE code = 'SHE-009' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['steel beam', 'rsj', 'structural steel', 'universal beam']::text[] WHERE code = 'STL-001' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['steel beam', 'rsj', 'structural steel', 'universal beam']::text[] WHERE code = 'STL-002' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['steel beam', 'rsj', 'structural steel', 'universal beam']::text[] WHERE code = 'STL-003' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['steel beam', 'rsj', 'structural steel', 'universal beam', 'steel box section', 'shs']::text[] WHERE code = 'STL-004' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['steel beam', 'rsj', 'structural steel', 'universal beam', 'steel channel', 'pfc']::text[] WHERE code = 'STL-005' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['steel beam', 'rsj', 'structural steel', 'universal beam', 'angle steel', 'steel angle']::text[] WHERE code = 'STL-006' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['lintel', 'steel lintel', 'cavity lintel']::text[] WHERE code = 'STL-007' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['lintel', 'steel lintel', 'cavity lintel']::text[] WHERE code = 'STL-008' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['lintel', 'steel lintel', 'cavity lintel']::text[] WHERE code = 'STL-009' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['lintel', 'steel lintel', 'cavity lintel']::text[] WHERE code = 'STL-010' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['lintel', 'steel lintel', 'cavity lintel']::text[] WHERE code = 'STL-011' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['lintel', 'steel lintel', 'cavity lintel']::text[] WHERE code = 'STL-012' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['lintel', 'steel lintel', 'cavity lintel']::text[] WHERE code = 'STL-013' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['timber', 'c24 timber', 'carcassing timber', 'structural timber', 'batten', 'roofing batten', 'timber batten']::text[] WHERE code = 'TIM-001' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['timber', 'c24 timber', 'carcassing timber', 'structural timber']::text[] WHERE code = 'TIM-002' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['timber', 'c24 timber', 'carcassing timber', 'structural timber', '3x2 timber']::text[] WHERE code = 'TIM-003' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['timber', 'c24 timber', 'carcassing timber', 'structural timber', '3x2 timber']::text[] WHERE code = 'TIM-004' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['timber', 'c24 timber', 'carcassing timber', 'structural timber', '3x2 timber']::text[] WHERE code = 'TIM-005' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['timber', 'c24 timber', 'carcassing timber', 'structural timber', '3x2 timber']::text[] WHERE code = 'TIM-006' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['timber', 'c24 timber', 'carcassing timber', 'structural timber', '3x2 timber']::text[] WHERE code = 'TIM-007' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['timber', 'c24 timber', 'carcassing timber', 'structural timber', '3x2 timber']::text[] WHERE code = 'TIM-008' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['timber', 'c24 timber', 'carcassing timber', 'structural timber', '3x2 timber']::text[] WHERE code = 'TIM-009' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['timber', 'c24 timber', 'carcassing timber', 'structural timber', '4x2 timber']::text[] WHERE code = 'TIM-010' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['timber', 'c24 timber', 'carcassing timber', 'structural timber', '4x2 timber']::text[] WHERE code = 'TIM-011' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['timber', 'c24 timber', 'carcassing timber', 'structural timber', '4x2 timber']::text[] WHERE code = 'TIM-012' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['timber', 'c24 timber', 'carcassing timber', 'structural timber', '4x2 timber']::text[] WHERE code = 'TIM-013' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['timber', 'c24 timber', 'carcassing timber', 'structural timber', '4x2 timber']::text[] WHERE code = 'TIM-014' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['timber', 'c24 timber', 'carcassing timber', 'structural timber', '4x2 timber']::text[] WHERE code = 'TIM-015' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['timber', 'c24 timber', 'carcassing timber', 'structural timber', '4x2 timber']::text[] WHERE code = 'TIM-016' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['timber', 'c24 timber', 'carcassing timber', 'structural timber', '6x2 timber']::text[] WHERE code = 'TIM-017' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['timber', 'c24 timber', 'carcassing timber', 'structural timber', '6x2 timber']::text[] WHERE code = 'TIM-018' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['timber', 'c24 timber', 'carcassing timber', 'structural timber', '6x2 timber']::text[] WHERE code = 'TIM-019' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['timber', 'c24 timber', 'carcassing timber', 'structural timber', '6x2 timber']::text[] WHERE code = 'TIM-020' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['timber', 'c24 timber', 'carcassing timber', 'structural timber', '6x2 timber']::text[] WHERE code = 'TIM-021' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['timber', 'c24 timber', 'carcassing timber', 'structural timber', '6x2 timber']::text[] WHERE code = 'TIM-022' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['timber', 'c24 timber', 'carcassing timber', 'structural timber', '6x2 timber']::text[] WHERE code = 'TIM-023' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['timber', 'c24 timber', 'carcassing timber', 'structural timber', '7x2 timber']::text[] WHERE code = 'TIM-024' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['timber', 'c24 timber', 'carcassing timber', 'structural timber', '7x2 timber']::text[] WHERE code = 'TIM-025' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['timber', 'c24 timber', 'carcassing timber', 'structural timber', '7x2 timber']::text[] WHERE code = 'TIM-026' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['timber', 'c24 timber', 'carcassing timber', 'structural timber', '7x2 timber']::text[] WHERE code = 'TIM-027' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['timber', 'c24 timber', 'carcassing timber', 'structural timber', '7x2 timber']::text[] WHERE code = 'TIM-028' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['timber', 'c24 timber', 'carcassing timber', 'structural timber', '7x2 timber']::text[] WHERE code = 'TIM-029' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['timber', 'c24 timber', 'carcassing timber', 'structural timber', '7x2 timber']::text[] WHERE code = 'TIM-030' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['timber', 'c24 timber', 'carcassing timber', 'structural timber', '8x2 timber']::text[] WHERE code = 'TIM-031' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['timber', 'c24 timber', 'carcassing timber', 'structural timber', '8x2 timber']::text[] WHERE code = 'TIM-032' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['timber', 'c24 timber', 'carcassing timber', 'structural timber', '8x2 timber']::text[] WHERE code = 'TIM-033' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['timber', 'c24 timber', 'carcassing timber', 'structural timber', '8x2 timber']::text[] WHERE code = 'TIM-034' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['timber', 'c24 timber', 'carcassing timber', 'structural timber', '8x2 timber']::text[] WHERE code = 'TIM-035' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['timber', 'c24 timber', 'carcassing timber', 'structural timber', '8x2 timber']::text[] WHERE code = 'TIM-036' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['timber', 'c24 timber', 'carcassing timber', 'structural timber', '8x2 timber']::text[] WHERE code = 'TIM-037' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['timber', 'c24 timber', 'carcassing timber', 'structural timber', '9x2 timber']::text[] WHERE code = 'TIM-038' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['timber', 'c24 timber', 'carcassing timber', 'structural timber', '9x2 timber']::text[] WHERE code = 'TIM-039' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['timber', 'c24 timber', 'carcassing timber', 'structural timber', '9x2 timber']::text[] WHERE code = 'TIM-040' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['timber', 'c24 timber', 'carcassing timber', 'structural timber', '9x2 timber']::text[] WHERE code = 'TIM-041' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['timber', 'c24 timber', 'carcassing timber', 'structural timber', '9x2 timber']::text[] WHERE code = 'TIM-042' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['timber', 'c24 timber', 'carcassing timber', 'structural timber', '9x2 timber']::text[] WHERE code = 'TIM-043' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['timber', 'c24 timber', 'carcassing timber', 'structural timber', '9x2 timber']::text[] WHERE code = 'TIM-044' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['timber', 'c24 timber', 'carcassing timber', 'structural timber', 'batten', 'roofing batten', 'timber batten']::text[] WHERE code = 'TIM-045' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['wall starter']::text[] WHERE code = 'UNI' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['wall ties', 'cavity ties']::text[] WHERE code = 'WALLTIES 250MM' AND is_active = true;

