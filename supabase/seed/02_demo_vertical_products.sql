-- =============================================================================
-- DEMO: sample products for non-construction verticals (SQL Editor)
-- =============================================================================
-- Idempotent upserts by product code (ON CONFLICT code).
-- Safe to re-run. Complements construction catalog already in schema seed.
-- =============================================================================

INSERT INTO public.products (
  code, name, description, unit, category, default_price, is_active,
  short_description, price_includes_vat
) VALUES
  -- Plumbing
  ('DEMO-PLU-001', '15mm Copper Tube 3m', 'Half-hard copper tube 15mm x 3m', 'LEN', 'Copper Tube & Fittings', 12.40, true, 'Half-hard copper tube 15mm x 3m', false),
  ('DEMO-PLU-002', '22mm Copper Tube 3m', 'Half-hard copper tube 22mm x 3m', 'LEN', 'Copper Tube & Fittings', 22.80, true, 'Half-hard copper tube 22mm x 3m', false),
  ('DEMO-PLU-003', '15mm End Feed Elbow', 'Copper end-feed 90 elbow 15mm', 'EA', 'Copper Tube & Fittings', 0.85, true, 'Copper end-feed 90 elbow 15mm', false),
  ('DEMO-PLU-004', '15mm Isolating Valve', 'Chrome plated isolating valve 15mm', 'EA', 'Valves & Controls', 4.20, true, 'Chrome plated isolating valve 15mm', false),
  ('DEMO-PLU-005', 'TRV Angled Pair', 'Thermostatic radiator valve pair', 'PR', 'Valves & Controls', 18.50, true, 'Thermostatic radiator valve pair', false),
  ('DEMO-PLU-006', '15mm Push-Fit Elbow', 'Plastic push-fit elbow 15mm', 'EA', 'Plastic Pipe Systems', 1.10, true, 'Plastic push-fit elbow 15mm', false),
  ('DEMO-PLU-007', 'Unvented Cylinder 150L', 'Indirect unvented cylinder 150 litre', 'EA', 'Heating & Cylinders', 480.00, true, 'Indirect unvented cylinder 150 litre', false),
  ('DEMO-PLU-008', 'Circulating Pump', 'Domestic heating circulator pump', 'EA', 'Heating & Cylinders', 95.00, true, 'Domestic heating circulator pump', false),
  ('DEMO-PLU-009', 'Close Coupled WC Pack', 'Trade WC pan, cistern and seat pack', 'EA', 'Sanitaryware Trade', 145.00, true, 'Trade WC pan, cistern and seat pack', false),
  ('DEMO-PLU-010', 'Basin Mixer Tap', 'Chrome basin mixer with waste', 'EA', 'Sanitaryware Trade', 48.00, true, 'Chrome basin mixer with waste', false),
  -- Electrical
  ('DEMO-ELE-001', '1.5mm T&E 100m', 'Twin and earth 1.5mm 100m drum', 'DR', 'Cable & Flex', 68.00, true, 'Twin and earth 1.5mm 100m drum', false),
  ('DEMO-ELE-002', '2.5mm T&E 100m', 'Twin and earth 2.5mm 100m drum', 'DR', 'Cable & Flex', 95.00, true, 'Twin and earth 2.5mm 100m drum', false),
  ('DEMO-ELE-003', 'Mini Trunking 25x16 3m', 'PVC mini trunking', 'LEN', 'Containment', 3.20, true, 'PVC mini trunking', false),
  ('DEMO-ELE-004', 'Consumer Unit 10-Way', 'Metal consumer unit 10 way', 'EA', 'Switchgear & Boards', 78.00, true, 'Metal consumer unit 10 way', false),
  ('DEMO-ELE-005', 'MCB 32A B Curve', 'Single pole MCB 32A', 'EA', 'Switchgear & Boards', 6.50, true, 'Single pole MCB 32A', false),
  ('DEMO-ELE-006', 'RCBO 32A 30mA', 'RCBO 32A Type A', 'EA', 'Switchgear & Boards', 22.00, true, 'RCBO 32A Type A', false),
  ('DEMO-ELE-007', 'LED Downlight 8W', 'Fire-rated LED downlight', 'EA', 'Lighting Trade', 9.50, true, 'Fire-rated LED downlight', false),
  ('DEMO-ELE-008', 'Double Socket White', '13A double socket white', 'EA', 'Wiring Accessories', 3.80, true, '13A double socket white', false),
  ('DEMO-ELE-009', '1-Gang Dimmer', 'Trailing edge dimmer switch', 'EA', 'Wiring Accessories', 12.50, true, 'Trailing edge dimmer switch', false),
  ('DEMO-ELE-010', 'Cable Clips 1.5mm (100)', 'Round cable clips pack', 'PK', 'Fixings', 2.10, true, 'Round cable clips pack', false),
  -- Windows
  ('DEMO-WIN-001', 'uPVC Casement Frame 1200x1200', 'White uPVC casement frame', 'EA', 'uPVC Frames', 185.00, true, 'White uPVC casement frame', false),
  ('DEMO-WIN-002', 'uPVC Door Frame Single', 'uPVC residential door frame', 'EA', 'uPVC Frames', 320.00, true, 'uPVC residential door frame', false),
  ('DEMO-WIN-003', 'Aluminium Casement 1200x1400', 'Powder-coated aluminium casement', 'EA', 'Aluminium Systems', 410.00, true, 'Powder-coated aluminium casement', false),
  ('DEMO-WIN-004', 'Double Glazed Unit 4-16-4', 'Clear double glazed unit per m2', 'M2', 'Glass & Glazing', 48.00, true, 'Clear double glazed unit per m2', false),
  ('DEMO-WIN-005', 'Multipoint Lock 45mm', 'Multipoint door lock 45mm backset', 'EA', 'Hardware & Handles', 38.00, true, 'Multipoint door lock 45mm backset', false),
  ('DEMO-WIN-006', 'Window Handle White', 'Espagnolette window handle', 'EA', 'Hardware & Handles', 8.50, true, 'Espagnolette window handle', false),
  ('DEMO-WIN-007', 'Low Modulus Silicone', 'Neutral cure silicone white', 'EA', 'Sealants & Fixings', 4.50, true, 'Neutral cure silicone white', false),
  ('DEMO-WIN-008', 'Frame Fixings 100mm (50)', 'Frame fixing pack', 'PK', 'Sealants & Fixings', 9.50, true, 'Frame fixing pack', false),
  ('DEMO-WIN-009', 'Suction Lifter Pair', 'Glass suction lifters', 'PR', 'Tools', 28.00, true, 'Glass suction lifters', false),
  ('DEMO-WIN-010', 'uPVC French Door Set', 'French door pair white uPVC', 'EA', 'uPVC Frames', 680.00, true, 'French door pair white uPVC', false),
  -- Tile
  ('DEMO-TIL-001', 'Porcelain Floor 600x600 Grey', 'Rectified porcelain floor tile', 'M2', 'Porcelain Tiles', 28.00, true, 'Rectified porcelain floor tile', false),
  ('DEMO-TIL-002', 'Porcelain Floor 800x800 White', 'Large format porcelain', 'M2', 'Porcelain Tiles', 36.00, true, 'Large format porcelain', false),
  ('DEMO-TIL-003', 'Ceramic Wall 250x400 White', 'Gloss ceramic wall tile', 'M2', 'Ceramic Tiles', 14.00, true, 'Gloss ceramic wall tile', false),
  ('DEMO-TIL-004', 'Ceramic Metro 100x200', 'Metro ceramic white', 'M2', 'Ceramic Tiles', 22.00, true, 'Metro ceramic white', false),
  ('DEMO-TIL-005', 'Travertine 406x610', 'Filled travertine', 'M2', 'Natural Stone', 42.00, true, 'Filled travertine', false),
  ('DEMO-TIL-006', 'Flexible Adhesive 20kg', 'C2TE flexible tile adhesive', 'BAG', 'Adhesives & Grouts', 14.50, true, 'C2TE flexible tile adhesive', false),
  ('DEMO-TIL-007', 'Grout 5kg Mid Grey', 'Cementitious grout', 'BAG', 'Adhesives & Grouts', 12.20, true, 'Cementitious grout', false),
  ('DEMO-TIL-008', 'Aluminium Tile Trim 2.5m', 'Straight edge trim', 'LEN', 'Trims & Profiles', 8.40, true, 'Straight edge trim', false),
  ('DEMO-TIL-009', 'Notched Trowel 10mm', 'Steel notched trowel', 'EA', 'Tools', 9.50, true, 'Steel notched trowel', false),
  ('DEMO-TIL-010', 'Tile Cutter 600mm', 'Manual tile cutter', 'EA', 'Tools', 45.00, true, 'Manual tile cutter', false)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  unit = EXCLUDED.unit,
  category = EXCLUDED.category,
  default_price = EXCLUDED.default_price,
  short_description = EXCLUDED.short_description,
  is_active = true,
  updated_at = now();

SELECT category, COUNT(*) AS n
  FROM public.products
 WHERE code LIKE 'DEMO-%'
 GROUP BY category
 ORDER BY category;
