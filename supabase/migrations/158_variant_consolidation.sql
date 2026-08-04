-- =============================================================================
-- 158_variant_consolidation.sql
-- =============================================================================
-- Replaces the 59 individual STL-014..072 product pages (UB / UC / SHS /
-- Flat) with 4 consolidated products, each carrying a `variant_options` JSONB
-- blob that exposes the size as a dropdown on the public product page.
--
--   STL-073  Universal Beam       21 size variants (UB 127x76x13kg ... 305x165x60kg)
--   STL-074  Universal Column     25 size variants (UC 152x152x23kg ... 305x305x240kg)
--   STL-075  Square Hollow Section  4 wall-thickness variants (4 / 5 / 8 / 10 mm)
--   STL-076  Flat Bar              9 size variants (100x20 ... 400x20)
--
-- The 59 individual rows (STL-014..072) are soft-deleted (deleted_at +
-- is_active=false) in the same migration and their codes are recorded in
-- product_redirects so the existing URL space keeps working — old
-- /products/STL-014 URLs redirect to /products/STL-073 (the new
-- consolidated Universal Beam page).
--
-- This REPLACES 155 (the original "59 separate products" plan). Do not
-- apply 155 before or after this migration. Apply order:
--
--   1. 155 — SKIP (superseded by 158)
--   2. 156 — image wire-up + SEO + search_tags
--   3. 157 — wire-up + STL consolidation
--   4. 158 — THIS migration (variant consolidation)
--
-- The variant infrastructure (variant_options JSONB, ProductVariantSelector
-- component, ProductPurchaseCard with variantDescription) is already in
-- place — this migration just populates the data.
-- =============================================================================

BEGIN;

-- ────────────────────────────────────────────────────────────────────────
-- 1. Soft-delete the 59 superseded product rows
--    (STL-014..072). Setting is_active=false keeps the rows around
--    for the redirects below; deleted_at is set so the catalogue and
--    search filters exclude them.
-- ────────────────────────────────────────────────────────────────────────

UPDATE public.products
SET
  is_active = false,
  deleted_at = now()
WHERE code IN ('STL-014', 'STL-015', 'STL-016', 'STL-017', 'STL-018', 'STL-019', 'STL-020', 'STL-021', 'STL-022', 'STL-023', 'STL-024', 'STL-025', 'STL-026', 'STL-027', 'STL-028', 'STL-029', 'STL-030', 'STL-031', 'STL-032', 'STL-033', 'STL-034', 'STL-035', 'STL-036', 'STL-037', 'STL-038', 'STL-039', 'STL-040', 'STL-041', 'STL-042', 'STL-043', 'STL-044', 'STL-045', 'STL-046', 'STL-047', 'STL-048', 'STL-049', 'STL-050', 'STL-051', 'STL-052', 'STL-053', 'STL-054', 'STL-055', 'STL-056', 'STL-057', 'STL-058', 'STL-059', 'STL-060', 'STL-061', 'STL-062', 'STL-063', 'STL-064', 'STL-065', 'STL-066', 'STL-067', 'STL-068', 'STL-069', 'STL-070', 'STL-071', 'STL-072')
  AND is_active = true;

-- ────────────────────────────────────────────────────────────────────────
-- 2. Record product redirects so old /products/{{code}} URLs land on
--    the new consolidated product page. INSERT ... ON CONFLICT so
--    re-running this migration (after 068 renumbering left entries
--    in the table) is a no-op.
-- ────────────────────────────────────────────────────────────────────────

INSERT INTO public.product_redirects (old_code, new_code) VALUES ('STL-014', 'STL-073') ON CONFLICT (old_code) DO UPDATE SET new_code = EXCLUDED.new_code;
INSERT INTO public.product_redirects (old_code, new_code) VALUES ('STL-015', 'STL-073') ON CONFLICT (old_code) DO UPDATE SET new_code = EXCLUDED.new_code;
INSERT INTO public.product_redirects (old_code, new_code) VALUES ('STL-016', 'STL-073') ON CONFLICT (old_code) DO UPDATE SET new_code = EXCLUDED.new_code;
INSERT INTO public.product_redirects (old_code, new_code) VALUES ('STL-017', 'STL-073') ON CONFLICT (old_code) DO UPDATE SET new_code = EXCLUDED.new_code;
INSERT INTO public.product_redirects (old_code, new_code) VALUES ('STL-018', 'STL-073') ON CONFLICT (old_code) DO UPDATE SET new_code = EXCLUDED.new_code;
INSERT INTO public.product_redirects (old_code, new_code) VALUES ('STL-019', 'STL-073') ON CONFLICT (old_code) DO UPDATE SET new_code = EXCLUDED.new_code;
INSERT INTO public.product_redirects (old_code, new_code) VALUES ('STL-020', 'STL-073') ON CONFLICT (old_code) DO UPDATE SET new_code = EXCLUDED.new_code;
INSERT INTO public.product_redirects (old_code, new_code) VALUES ('STL-021', 'STL-073') ON CONFLICT (old_code) DO UPDATE SET new_code = EXCLUDED.new_code;
INSERT INTO public.product_redirects (old_code, new_code) VALUES ('STL-022', 'STL-073') ON CONFLICT (old_code) DO UPDATE SET new_code = EXCLUDED.new_code;
INSERT INTO public.product_redirects (old_code, new_code) VALUES ('STL-023', 'STL-073') ON CONFLICT (old_code) DO UPDATE SET new_code = EXCLUDED.new_code;
INSERT INTO public.product_redirects (old_code, new_code) VALUES ('STL-024', 'STL-073') ON CONFLICT (old_code) DO UPDATE SET new_code = EXCLUDED.new_code;
INSERT INTO public.product_redirects (old_code, new_code) VALUES ('STL-025', 'STL-073') ON CONFLICT (old_code) DO UPDATE SET new_code = EXCLUDED.new_code;
INSERT INTO public.product_redirects (old_code, new_code) VALUES ('STL-026', 'STL-073') ON CONFLICT (old_code) DO UPDATE SET new_code = EXCLUDED.new_code;
INSERT INTO public.product_redirects (old_code, new_code) VALUES ('STL-027', 'STL-073') ON CONFLICT (old_code) DO UPDATE SET new_code = EXCLUDED.new_code;
INSERT INTO public.product_redirects (old_code, new_code) VALUES ('STL-028', 'STL-073') ON CONFLICT (old_code) DO UPDATE SET new_code = EXCLUDED.new_code;
INSERT INTO public.product_redirects (old_code, new_code) VALUES ('STL-029', 'STL-073') ON CONFLICT (old_code) DO UPDATE SET new_code = EXCLUDED.new_code;
INSERT INTO public.product_redirects (old_code, new_code) VALUES ('STL-030', 'STL-073') ON CONFLICT (old_code) DO UPDATE SET new_code = EXCLUDED.new_code;
INSERT INTO public.product_redirects (old_code, new_code) VALUES ('STL-031', 'STL-073') ON CONFLICT (old_code) DO UPDATE SET new_code = EXCLUDED.new_code;
INSERT INTO public.product_redirects (old_code, new_code) VALUES ('STL-032', 'STL-073') ON CONFLICT (old_code) DO UPDATE SET new_code = EXCLUDED.new_code;
INSERT INTO public.product_redirects (old_code, new_code) VALUES ('STL-033', 'STL-073') ON CONFLICT (old_code) DO UPDATE SET new_code = EXCLUDED.new_code;
INSERT INTO public.product_redirects (old_code, new_code) VALUES ('STL-034', 'STL-073') ON CONFLICT (old_code) DO UPDATE SET new_code = EXCLUDED.new_code;
INSERT INTO public.product_redirects (old_code, new_code) VALUES ('STL-035', 'STL-074') ON CONFLICT (old_code) DO UPDATE SET new_code = EXCLUDED.new_code;
INSERT INTO public.product_redirects (old_code, new_code) VALUES ('STL-036', 'STL-074') ON CONFLICT (old_code) DO UPDATE SET new_code = EXCLUDED.new_code;
INSERT INTO public.product_redirects (old_code, new_code) VALUES ('STL-037', 'STL-074') ON CONFLICT (old_code) DO UPDATE SET new_code = EXCLUDED.new_code;
INSERT INTO public.product_redirects (old_code, new_code) VALUES ('STL-038', 'STL-074') ON CONFLICT (old_code) DO UPDATE SET new_code = EXCLUDED.new_code;
INSERT INTO public.product_redirects (old_code, new_code) VALUES ('STL-039', 'STL-074') ON CONFLICT (old_code) DO UPDATE SET new_code = EXCLUDED.new_code;
INSERT INTO public.product_redirects (old_code, new_code) VALUES ('STL-040', 'STL-074') ON CONFLICT (old_code) DO UPDATE SET new_code = EXCLUDED.new_code;
INSERT INTO public.product_redirects (old_code, new_code) VALUES ('STL-041', 'STL-074') ON CONFLICT (old_code) DO UPDATE SET new_code = EXCLUDED.new_code;
INSERT INTO public.product_redirects (old_code, new_code) VALUES ('STL-042', 'STL-074') ON CONFLICT (old_code) DO UPDATE SET new_code = EXCLUDED.new_code;
INSERT INTO public.product_redirects (old_code, new_code) VALUES ('STL-043', 'STL-074') ON CONFLICT (old_code) DO UPDATE SET new_code = EXCLUDED.new_code;
INSERT INTO public.product_redirects (old_code, new_code) VALUES ('STL-044', 'STL-074') ON CONFLICT (old_code) DO UPDATE SET new_code = EXCLUDED.new_code;
INSERT INTO public.product_redirects (old_code, new_code) VALUES ('STL-045', 'STL-074') ON CONFLICT (old_code) DO UPDATE SET new_code = EXCLUDED.new_code;
INSERT INTO public.product_redirects (old_code, new_code) VALUES ('STL-046', 'STL-074') ON CONFLICT (old_code) DO UPDATE SET new_code = EXCLUDED.new_code;
INSERT INTO public.product_redirects (old_code, new_code) VALUES ('STL-047', 'STL-074') ON CONFLICT (old_code) DO UPDATE SET new_code = EXCLUDED.new_code;
INSERT INTO public.product_redirects (old_code, new_code) VALUES ('STL-048', 'STL-074') ON CONFLICT (old_code) DO UPDATE SET new_code = EXCLUDED.new_code;
INSERT INTO public.product_redirects (old_code, new_code) VALUES ('STL-049', 'STL-074') ON CONFLICT (old_code) DO UPDATE SET new_code = EXCLUDED.new_code;
INSERT INTO public.product_redirects (old_code, new_code) VALUES ('STL-050', 'STL-074') ON CONFLICT (old_code) DO UPDATE SET new_code = EXCLUDED.new_code;
INSERT INTO public.product_redirects (old_code, new_code) VALUES ('STL-051', 'STL-074') ON CONFLICT (old_code) DO UPDATE SET new_code = EXCLUDED.new_code;
INSERT INTO public.product_redirects (old_code, new_code) VALUES ('STL-052', 'STL-074') ON CONFLICT (old_code) DO UPDATE SET new_code = EXCLUDED.new_code;
INSERT INTO public.product_redirects (old_code, new_code) VALUES ('STL-053', 'STL-074') ON CONFLICT (old_code) DO UPDATE SET new_code = EXCLUDED.new_code;
INSERT INTO public.product_redirects (old_code, new_code) VALUES ('STL-054', 'STL-074') ON CONFLICT (old_code) DO UPDATE SET new_code = EXCLUDED.new_code;
INSERT INTO public.product_redirects (old_code, new_code) VALUES ('STL-055', 'STL-074') ON CONFLICT (old_code) DO UPDATE SET new_code = EXCLUDED.new_code;
INSERT INTO public.product_redirects (old_code, new_code) VALUES ('STL-056', 'STL-074') ON CONFLICT (old_code) DO UPDATE SET new_code = EXCLUDED.new_code;
INSERT INTO public.product_redirects (old_code, new_code) VALUES ('STL-057', 'STL-074') ON CONFLICT (old_code) DO UPDATE SET new_code = EXCLUDED.new_code;
INSERT INTO public.product_redirects (old_code, new_code) VALUES ('STL-058', 'STL-074') ON CONFLICT (old_code) DO UPDATE SET new_code = EXCLUDED.new_code;
INSERT INTO public.product_redirects (old_code, new_code) VALUES ('STL-059', 'STL-074') ON CONFLICT (old_code) DO UPDATE SET new_code = EXCLUDED.new_code;
INSERT INTO public.product_redirects (old_code, new_code) VALUES ('STL-060', 'STL-075') ON CONFLICT (old_code) DO UPDATE SET new_code = EXCLUDED.new_code;
INSERT INTO public.product_redirects (old_code, new_code) VALUES ('STL-061', 'STL-075') ON CONFLICT (old_code) DO UPDATE SET new_code = EXCLUDED.new_code;
INSERT INTO public.product_redirects (old_code, new_code) VALUES ('STL-062', 'STL-075') ON CONFLICT (old_code) DO UPDATE SET new_code = EXCLUDED.new_code;
INSERT INTO public.product_redirects (old_code, new_code) VALUES ('STL-063', 'STL-075') ON CONFLICT (old_code) DO UPDATE SET new_code = EXCLUDED.new_code;
INSERT INTO public.product_redirects (old_code, new_code) VALUES ('STL-064', 'STL-076') ON CONFLICT (old_code) DO UPDATE SET new_code = EXCLUDED.new_code;
INSERT INTO public.product_redirects (old_code, new_code) VALUES ('STL-065', 'STL-076') ON CONFLICT (old_code) DO UPDATE SET new_code = EXCLUDED.new_code;
INSERT INTO public.product_redirects (old_code, new_code) VALUES ('STL-066', 'STL-076') ON CONFLICT (old_code) DO UPDATE SET new_code = EXCLUDED.new_code;
INSERT INTO public.product_redirects (old_code, new_code) VALUES ('STL-067', 'STL-076') ON CONFLICT (old_code) DO UPDATE SET new_code = EXCLUDED.new_code;
INSERT INTO public.product_redirects (old_code, new_code) VALUES ('STL-068', 'STL-076') ON CONFLICT (old_code) DO UPDATE SET new_code = EXCLUDED.new_code;
INSERT INTO public.product_redirects (old_code, new_code) VALUES ('STL-069', 'STL-076') ON CONFLICT (old_code) DO UPDATE SET new_code = EXCLUDED.new_code;
INSERT INTO public.product_redirects (old_code, new_code) VALUES ('STL-070', 'STL-076') ON CONFLICT (old_code) DO UPDATE SET new_code = EXCLUDED.new_code;
INSERT INTO public.product_redirects (old_code, new_code) VALUES ('STL-071', 'STL-076') ON CONFLICT (old_code) DO UPDATE SET new_code = EXCLUDED.new_code;
INSERT INTO public.product_redirects (old_code, new_code) VALUES ('STL-072', 'STL-076') ON CONFLICT (old_code) DO UPDATE SET new_code = EXCLUDED.new_code;

-- ────────────────────────────────────────────────────────────────────────
-- 3. Insert the 4 consolidated products with variant_options JSONB
-- ────────────────────────────────────────────────────────────────────────

INSERT INTO public.products (
  code,
  name,
  description,
  short_description,
  seo_title,
  seo_description,
  unit,
  category,
  default_price,
  image_url,
  is_active,
  materials,
  search_tags,
  variant_options,
  family_slug
) VALUES
  ('STL-073',
   'Universal Beam',
   'Universal Beam (UB) is a hot-rolled structural steel I-section for load-bearing beams, lintels, floor joists and roof beams. Standard UK BS4 sections in S275JR mild steel, available cut to length or in standard mill lengths. Select a section size below for kg/m mass, overall dimensions and trade pricing.',
   'Hot-rolled structural steel universal beam (RSJ) — 21 BS4 section sizes from UB 127x76x13kg to UB 305x165x60kg.',
   'Universal Beam (UB) | Star Hawk Builders Merchant',
   'Order Universal Beams (UB) online. 21 standard BS4 sections from UB 127x76x13kg to UB 305x165x60kg in S275JR mild steel. Cut to size, mill lengths and same-day delivery from Star Hawk.',
   'EA',
   'Steel & Lintels',
   0,
   '/products/universal-beam-mild-steel.webp',
   true,
   to_jsonb(ARRAY['Mild steel']),
   ARRAY['UB 127x76x13kg', 'UB 152x89x16kg', 'UB 152x89x19kg', 'UB 178x102x19kg', 'UB 178x102x22kg', 'UB 178x102x25kg', 'UB 203x102x23kg', 'UB 203x133x25kg', 'UB 203x133x30kg', 'UB 203x133x37kg', 'UB 254x102x22kg', 'UB 254x102x25kg', 'UB 254x146x31kg', 'UB 254x146x37kg', 'UB 254x146x43kg', 'UB 305x102x25kg', 'UB 305x102x28kg', 'UB 305x165x40kg', 'UB 305x165x46kg', 'UB 305x165x54kg', 'UB 305x165x60kg']::text[],
   '[{"material": "Mild steel", "image": "/products/universal-beam-mild-steel.webp", "selectors": [{"name": "size", "label": "Section size", "options": [{"value": "ub-127x76x13", "text": "UB 127x76x13kg"}, {"value": "ub-152x89x16", "text": "UB 152x89x16kg"}, {"value": "ub-152x89x19", "text": "UB 152x89x19kg"}, {"value": "ub-178x102x19", "text": "UB 178x102x19kg"}, {"value": "ub-178x102x22", "text": "UB 178x102x22kg"}, {"value": "ub-178x102x25", "text": "UB 178x102x25kg"}, {"value": "ub-203x102x23", "text": "UB 203x102x23kg"}, {"value": "ub-203x133x25", "text": "UB 203x133x25kg"}, {"value": "ub-203x133x30", "text": "UB 203x133x30kg"}, {"value": "ub-203x133x37", "text": "UB 203x133x37kg"}, {"value": "ub-254x102x22", "text": "UB 254x102x22kg"}, {"value": "ub-254x102x25", "text": "UB 254x102x25kg"}, {"value": "ub-254x146x31", "text": "UB 254x146x31kg"}, {"value": "ub-254x146x37", "text": "UB 254x146x37kg"}, {"value": "ub-254x146x43", "text": "UB 254x146x43kg"}, {"value": "ub-305x102x25", "text": "UB 305x102x25kg"}, {"value": "ub-305x102x28", "text": "UB 305x102x28kg"}, {"value": "ub-305x165x40", "text": "UB 305x165x40kg"}, {"value": "ub-305x165x46", "text": "UB 305x165x46kg"}, {"value": "ub-305x165x54", "text": "UB 305x165x54kg"}, {"value": "ub-305x165x60", "text": "UB 305x165x60kg"}]}]}]'::jsonb,
   'universal-beam'),
  ('STL-074',
   'Universal Column',
   'Universal Column (UC) is a hot-rolled structural steel H-section for columns, posts, stanchions and portal frames. Standard UK BS4 sections in S275JR mild steel, available cut to length or in standard mill lengths. Select a section size below for kg/m mass, overall dimensions and trade pricing.',
   'Hot-rolled structural steel universal column — 25 BS4 section sizes from UC 152x152x23kg to UC 305x305x240kg.',
   'Universal Column (UC) | Star Hawk Builders Merchant',
   'Order Universal Columns (UC) online. 25 standard BS4 sections from UC 152x152x23kg to UC 305x305x240kg in S275JR mild steel. Cut to size, mill lengths and same-day delivery from Star Hawk.',
   'EA',
   'Steel & Lintels',
   0,
   '/products/universal-column-mild-steel.webp',
   true,
   to_jsonb(ARRAY['Mild steel']),
   ARRAY['UC 152x152x23kg', 'UC 152x152x30kg', 'UC 152x152x37kg', 'UC 152x152x44kg', 'UC 152x152x51kg', 'UC 152x152x58kg', 'UC 152x152x67kg', 'UC 203x203x46kg', 'UC 203x203x52kg', 'UC 203x203x60kg', 'UC 203x203x71kg', 'UC 203x203x86kg', 'UC 203x203x100kg', 'UC 203x203x113kg', 'UC 254x254x73kg', 'UC 254x254x89kg', 'UC 254x254x107kg', 'UC 254x254x132kg', 'UC 254x254x167kg', 'UC 305x305x97kg', 'UC 305x305x118kg', 'UC 305x305x137kg', 'UC 305x305x158kg', 'UC 305x305x198kg', 'UC 305x305x240kg']::text[],
   '[{"material": "Mild steel", "image": "/products/universal-column-mild-steel.webp", "selectors": [{"name": "size", "label": "Section size", "options": [{"value": "uc-152x152x23", "text": "UC 152x152x23kg"}, {"value": "uc-152x152x30", "text": "UC 152x152x30kg"}, {"value": "uc-152x152x37", "text": "UC 152x152x37kg"}, {"value": "uc-152x152x44", "text": "UC 152x152x44kg"}, {"value": "uc-152x152x51", "text": "UC 152x152x51kg"}, {"value": "uc-152x152x58", "text": "UC 152x152x58kg"}, {"value": "uc-152x152x67", "text": "UC 152x152x67kg"}, {"value": "uc-203x203x46", "text": "UC 203x203x46kg"}, {"value": "uc-203x203x52", "text": "UC 203x203x52kg"}, {"value": "uc-203x203x60", "text": "UC 203x203x60kg"}, {"value": "uc-203x203x71", "text": "UC 203x203x71kg"}, {"value": "uc-203x203x86", "text": "UC 203x203x86kg"}, {"value": "uc-203x203x100", "text": "UC 203x203x100kg"}, {"value": "uc-203x203x113", "text": "UC 203x203x113kg"}, {"value": "uc-254x254x73", "text": "UC 254x254x73kg"}, {"value": "uc-254x254x89", "text": "UC 254x254x89kg"}, {"value": "uc-254x254x107", "text": "UC 254x254x107kg"}, {"value": "uc-254x254x132", "text": "UC 254x254x132kg"}, {"value": "uc-254x254x167", "text": "UC 254x254x167kg"}, {"value": "uc-305x305x97", "text": "UC 305x305x97kg"}, {"value": "uc-305x305x118", "text": "UC 305x305x118kg"}, {"value": "uc-305x305x137", "text": "UC 305x305x137kg"}, {"value": "uc-305x305x158", "text": "UC 305x305x158kg"}, {"value": "uc-305x305x198", "text": "UC 305x305x198kg"}, {"value": "uc-305x305x240", "text": "UC 305x305x240kg"}]}]}]'::jsonb,
   'universal-column'),
  ('STL-075',
   'Square Hollow Section',
   'Square Hollow Section (SHS) is a hot-finished structural steel tube for columns, posts, frames, balustrades and general fabrication. Standard UK BS EN 10210 sections in S275JR/S355JR mild steel, 100mm x 100mm outer with four wall thickness options. Select a thickness below for kg/m mass and trade pricing.',
   'Hot-finished mild-steel square hollow section — 100x100mm outer with 4mm, 5mm, 8mm or 10mm wall thickness.',
   'Square Hollow Section (SHS) | Star Hawk Builders Merchant',
   'Order Square Hollow Sections (SHS) online. 100x100mm outer with 4mm, 5mm, 8mm or 10mm wall, in S275JR/S355JR mild steel. Cut to size, mill lengths and same-day delivery from Star Hawk.',
   'EA',
   'Steel & Lintels',
   0,
   '/products/square-hollow-section-mild-steel.webp',
   true,
   to_jsonb(ARRAY['Mild steel']),
   ARRAY['SHS 100x100x4mm (11.7 kg/m)', 'SHS 100x100x5mm (14.4 kg/m)', 'SHS 100x100x8mm (22.9 kg/m)', 'SHS 100x100x10mm (27.9 kg/m)']::text[],
   '[{"material": "Mild steel", "image": "/products/square-hollow-section-mild-steel.webp", "selectors": [{"name": "wall", "label": "Wall thickness", "options": [{"value": "shs-100x100x4", "text": "SHS 100x100x4mm (11.7 kg/m)"}, {"value": "shs-100x100x5", "text": "SHS 100x100x5mm (14.4 kg/m)"}, {"value": "shs-100x100x8", "text": "SHS 100x100x8mm (22.9 kg/m)"}, {"value": "shs-100x100x10", "text": "SHS 100x100x10mm (27.9 kg/m)"}]}]}]'::jsonb,
   'square-hollow-section'),
  ('STL-076',
   'Flat Bar',
   'Flat Bar is a hot-rolled mild-steel rectangular bar for fabrication, base plates, gusset plates, brackets, gate frames and general workshop use. Standard UK sizes from 100x20mm up to 400x20mm. Select a size below for kg/m mass and trade pricing.',
   'Hot-rolled mild-steel flat bar — 9 sizes from 100x20mm to 400x20mm.',
   'Flat Bar | Star Hawk Builders Merchant',
   'Order Flat Bar online. 9 sizes from 100x20mm to 400x20mm in S275JR mild steel. Cut to length, mill lengths and same-day delivery from Star Hawk Builders Merchant.',
   'EA',
   'Steel & Lintels',
   0,
   '/products/flat-bar-mild-steel.webp',
   true,
   to_jsonb(ARRAY['Mild steel']),
   ARRAY['Flat 100x20mm (15.70 kg/m)', 'Flat 200x20mm (31.40 kg/m)', 'Flat 300x20mm (47.10 kg/m)', 'Flat 300x10mm (23.55 kg/m)', 'Flat 300x12mm (28.26 kg/m)', 'Flat 400x20mm (62.80 kg/m)', 'Flat 350x15mm (41.21 kg/m)', 'Flat 350x12mm (32.97 kg/m)', 'Flat 350x20mm (54.95 kg/m)']::text[],
   '[{"material": "Mild steel", "image": "/products/flat-bar-mild-steel.webp", "selectors": [{"name": "size", "label": "Bar size", "options": [{"value": "flat-100x20", "text": "Flat 100x20mm (15.70 kg/m)"}, {"value": "flat-200x20", "text": "Flat 200x20mm (31.40 kg/m)"}, {"value": "flat-300x20", "text": "Flat 300x20mm (47.10 kg/m)"}, {"value": "flat-300x10", "text": "Flat 300x10mm (23.55 kg/m)"}, {"value": "flat-300x12", "text": "Flat 300x12mm (28.26 kg/m)"}, {"value": "flat-400x20", "text": "Flat 400x20mm (62.80 kg/m)"}, {"value": "flat-350x15", "text": "Flat 350x15mm (41.21 kg/m)"}, {"value": "flat-350x12", "text": "Flat 350x12mm (32.97 kg/m)"}, {"value": "flat-350x20", "text": "Flat 350x20mm (54.95 kg/m)"}]}]}]'::jsonb,
   'flat-bar')
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  short_description = EXCLUDED.short_description,
  seo_title = EXCLUDED.seo_title,
  seo_description = EXCLUDED.seo_description,
  category = EXCLUDED.category,
  image_url = EXCLUDED.image_url,
  materials = EXCLUDED.materials,
  search_tags = EXCLUDED.search_tags,
  variant_options = EXCLUDED.variant_options,
  family_slug = EXCLUDED.family_slug,
  is_active = true,
  deleted_at = NULL;

COMMIT;


