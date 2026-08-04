// lib/calculators/type-content.ts
// Long-form content for each quote/calculators/[type] page. These pages are
// naturally tool-heavy and can be thin, so this file supplies an intro,
// how-to guide, common projects and FAQs that push each page well above the
// 500-word threshold while staying genuinely useful.

import type { CalculatorType } from '@/lib/calculators'

export interface CalculatorTypeFaq {
  q: string
  a: string
}

export interface CalculatorTypeProject {
  title: string
  description: string
}

export interface CalculatorTypeContent {
  intro: string
  howTo: string[]
  projects: CalculatorTypeProject[]
  faqs: CalculatorTypeFaq[]
}

export const CALCULATOR_TYPE_CONTENT: Record<CalculatorType, CalculatorTypeContent> = {
  BRICK_WALL: {
    intro:
      'Use this calculator to estimate the number of bricks or blocks needed for a wall, including a wastage allowance. It is useful for garden walls, extensions, garages and any project where you need to order the right quantity of masonry units without over-ordering.',
    howTo: [
      'Enter the length and height of the wall in metres.',
      'Choose whether you are building a single-skin or one-brick (two-skin) wall.',
      'Set the wastage allowance — 5% for straight walls, 10% for walls with a lot of corners or openings.',
      'The calculator returns the brick or block count and the approximate mortar requirement.',
    ],
    projects: [
      { title: '5 m garden wall', description: 'A 5 m × 1.8 m single-skin wall needs roughly 540 bricks before wastage.' },
      { title: 'Extension shell', description: 'A 6 m × 2.5 m one-brick extension leaf needs around 900 bricks.' },
      { title: 'Garage blockwork', description: 'A 5 m × 2.4 m block wall needs about 120 blocks for a single skin.' },
    ],
    faqs: [
      { q: 'How many bricks are in 1 m²?', a: 'There are roughly 60 bricks per m² of single-skin wall and 120 bricks per m² of one-brick (two-leaf) wall.' },
      { q: 'How many blocks per m²?', a: 'A standard 440 × 215 mm block gives about 10 blocks per m² of wall face.' },
      { q: 'What wastage should I allow?', a: 'Allow 5% for simple walls and 10% for walls with many corners, openings or decorative features.' },
    ],
  },
  MORTAR_CONCRETE: {
    intro:
      'Estimate the volume of concrete or mortar you need for footings, slabs, columns, brickwork and blockwork. Enter your dimensions and the calculator converts them into cubic metres, then into bags of cement and tonnes of sand or ballast for ordering.',
    howTo: [
      'Select concrete or mortar depending on the job.',
      'Enter length, width and depth in metres for concrete, or wall area and joint thickness for mortar.',
      'Choose your mix ratio if known — the calculator defaults to common trade mixes.',
      'Read off the cement bags, sand and aggregate quantities needed.',
    ],
    projects: [
      { title: '1 m³ concrete footing', description: 'Needs roughly 12–14 bags of cement and around 1.5 tonnes of ballast.' },
      { title: '10 m² brickwork mortar', description: 'Needs about 4–5 bags of cement and 500 kg of sharp sand for a 1:5 mix.' },
      { title: '0.5 m³ mortar for blockwork', description: 'Needs roughly 6–7 bags of cement plus the matching sand.' },
    ],
    faqs: [
      { q: 'What mix ratio should I use?', a: 'A 1:5 cement-to-sand mix is standard for brickwork, 1:4 below DPC, and 1:2:3 or similar for general concrete.' },
      { q: 'How much concrete does a 25 kg bag of cement make?', a: 'One 25 kg bag of cement mixed with ballast makes roughly 0.07–0.08 m³ of concrete.' },
      { q: 'Should I order extra?', a: 'Yes. Add 5–10% for concrete slabs and 10% for footings and columns to cover spillage and over-excavation.' },
    ],
  },
  SHEET_MATERIALS: {
    intro:
      'Calculate how many sheets of plywood, OSB, chipboard or plasterboard you need for flooring, roofing, wall sheathing and linings. The calculator works in standard 2.4 m × 1.2 m sheets and adds a wastage allowance for cuts.',
    howTo: [
      'Measure the total area to be covered in square metres.',
      'Select the sheet size — the default is a standard 2.88 m² sheet.',
      'Add a wastage allowance for cuts, typically 10% for simple rooms and 15% for complex layouts.',
      'The calculator returns the sheet count to order.',
    ],
    projects: [
      { title: '16 m² loft floor', description: 'Needs roughly 7 sheets of 18 mm OSB3 or P5 chipboard.' },
      { title: '24 m² timber-frame wall', description: 'Needs about 9 sheets of 9 mm OSB3 sheathing.' },
      { title: '30 m² plasterboard ceiling', description: 'Needs roughly 11 sheets of standard wallboard.' },
    ],
    faqs: [
      { q: 'What size are standard sheets?', a: 'Most structural and plasterboard sheets are 2.4 m × 1.2 m, giving 2.88 m² per sheet.' },
      { q: 'How much wastage should I add?', a: 'Add 10% for rectangular rooms and 15% for rooms with many openings or angled walls.' },
      { q: 'Can I use OSB instead of plywood?', a: 'OSB3 is fine for flooring and sheathing where a smooth face is not required. Plywood is better for shuttering and visible faces.' },
    ],
  },
  AGGREGATES: {
    intro:
      'Estimate the quantity of MOT Type 1, sharp sand, building sand, ballast, gravel or shingle you need in tonnes or bulk bags. Enter the area, depth and material type and the calculator returns the weight for ordering.',
    howTo: [
      'Choose the aggregate type you are ordering.',
      'Enter the area in square metres and the depth in millimetres.',
      'The calculator uses the bulk density of the material to convert volume to tonnes.',
      'Add a small compaction allowance for sub-base materials.',
    ],
    projects: [
      { title: '20 m² driveway sub-base', description: '150 mm of MOT Type 1 needs roughly 6 tonnes before compaction.' },
      { title: '10 m² bedding sand', description: '50 mm of sharp sand needs about 1.3 tonnes.' },
      { title: '1 m³ concrete ballast', description: 'Needs roughly 1.6 tonnes of 20 mm ballast.' },
    ],
    faqs: [
      { q: 'What depth should MOT Type 1 be?', a: 'Allow 100 mm for patios and 150 mm for driveways and areas with vehicle traffic.' },
      { q: 'How many tonnes are in a cubic metre?', a: 'It depends on the material: MOT Type 1 is roughly 2 tonnes/m³, sharp sand about 1.6 tonnes/m³, ballast about 1.6 tonnes/m³.' },
      { q: 'Do I need to compact MOT Type 1?', a: 'Yes. Compact it in layers with a plate compactor or roller for a stable sub-base.' },
    ],
  },
  SCREED: {
    intro:
      'Work out the volume of sand and cement screed needed for a floor topping. Enter the floor area and the screed thickness and the calculator returns the dry materials required for a traditional screed mix.',
    howTo: [
      'Measure the floor area in square metres.',
      'Enter the screed thickness in millimetres — typically 50–75 mm for a floating screed.',
      'Choose the mix ratio if required; the default is 1:3 cement to sharp sand.',
      'Read off the cement bags and sand tonnes needed.',
    ],
    projects: [
      { title: '20 m² screed at 50 mm', description: 'Needs roughly 1 m³ of screed, about 10 bags of cement and 1 tonne of sharp sand.' },
      { title: '40 m² screed at 65 mm', description: 'Needs roughly 2.6 m³ of screed and double the material quantities.' },
      { title: 'Utility screed patch', description: '5 m² at 40 mm needs about 0.2 m³ of screed.' },
    ],
    faqs: [
      { q: 'What mix ratio is used for screed?', a: 'A 1:3 cement-to-sharp-sand mix is common for traditional screed, giving a strong, level topping.' },
      { q: 'How thick should screed be?', a: 'Bonded screeds can be 40–50 mm; unbonded or floating screeds are usually 65–75 mm.' },
      { q: 'Can I add fibres to screed?', a: 'Yes. Polypropylene fibres reduce shrinkage cracking and are often added to site-mixed screed.' },
    ],
  },
  PLASTERING: {
    intro:
      'Estimate plaster, render or plasterboard quantities for walls and ceilings. Enter the area and the type of finish and the calculator returns bags of plaster, render or the number of plasterboard sheets required.',
    howTo: [
      'Measure the wall or ceiling area in square metres.',
      'Choose the finish type: skim plaster, base coat, render or plasterboard.',
      'Enter the number of coats if applicable.',
      'The calculator returns the material quantity based on standard coverage rates.',
    ],
    projects: [
      { title: '30 m² skim coat', description: 'Needs roughly 3 bags of finish plaster at 2–3 mm thickness.' },
      { title: '20 m² two-coat render', description: 'Needs about 10–12 bags of render depending on thickness.' },
      { title: '16 m² plasterboard wall', description: 'Needs roughly 6 sheets of standard 2.4 m × 1.2 m board.' },
    ],
    faqs: [
      { q: 'How many m² does a 25 kg bag of plaster cover?', a: 'A bag of finish plaster covers roughly 10 m² at a 2–3 mm skim thickness.' },
      { q: 'What is the difference between bonding and hardwall?', a: 'Bonding coat is used on low-suction backgrounds such as plasterboard. Hardwall is a stronger base coat for blockwork and high-suction walls.' },
      { q: 'Do I need PVA before skimming?', a: 'High-suction backgrounds usually need PVA or a bonding agent to control suction and improve adhesion.' },
    ],
  },
  INSULATION: {
    intro:
      'Estimate the area or number of insulation boards, slabs and rolls needed for walls, floors, roofs and lofts. Enter the dimensions and the calculator adds a wastage allowance for cuts around openings.',
    howTo: [
      'Measure the area to insulate in square metres.',
      'Select the product form: rigid board, slab or roll.',
      'Enter the pack or roll coverage from the product page.',
      'Add 5–10% wastage for cuts and offcuts.',
    ],
    projects: [
      { title: '30 m² pitched roof', description: 'Needs roughly 11 rigid insulation boards between the rafters.' },
      { title: '20 m² solid floor', description: 'Needs about 7 boards of 2.4 m × 1.2 m insulation.' },
      { title: '40 m² loft roll', description: 'Needs roughly 2–3 rolls depending on the roll width and thickness.' },
    ],
    faqs: [
      { q: 'How much insulation wastage should I allow?', a: 'Allow 5% for simple rectangles and 10% for roofs and walls with many openings.' },
      { q: 'Should insulation boards be tight together?', a: 'Yes. Gaps create cold bridges; boards should be butted tightly and any gaps filled with offcuts.' },
      { q: 'What thickness do I need?', a: 'The thickness is driven by the U-value target in your building regulations or specification. Thicker boards give lower U-values.' },
    ],
  },
  ROOFING: {
    intro:
      'Estimate roofing felt, membrane, guttering and trim quantities. Enter the roof dimensions or the run lengths and the calculator returns the rolls, lengths or packs you need to order.',
    howTo: [
      'Select the roofing product you are estimating.',
      'Enter the roof area for rolls and membranes, or the run length for guttering and trim.',
      'Add the recommended lap or wastage allowance.',
      'The calculator returns the number of rolls or metres required.',
    ],
    projects: [
      { title: '20 m² flat roof felt', description: 'Needs roughly 2 rolls of torch-on felt with a 75 mm lap.' },
      { title: '15 m gutter run', description: 'Needs 4 gutter lengths at 4 m each plus fittings.' },
      { title: '30 m² breathable membrane', description: 'Needs roughly 1–2 rolls depending on roll width.' },
    ],
    faqs: [
      { q: 'How much lap should I allow for felt?', a: 'Allow 75–100 mm side laps and 150 mm end laps for torch-on felt.' },
      { q: 'What is the difference between felt and membrane?', a: 'Torch-on felt is a waterproof roof covering. Breathable membrane goes under tiles or slates and lets vapour out while keeping water out.' },
      { q: 'Do I need a separate vapour barrier?', a: 'Some roof build-ups need a vapour control layer on the warm side of the insulation. Check your specification or building control guidance.' },
    ],
  },
  TIMBER: {
    intro:
      'Estimate the linear metres or number of timber pieces needed for framing, joists, battens and decking. Enter the dimensions of the structure and the calculator works out the total length and suggests common stock lengths.',
    howTo: [
      'Select the timber use: framing, joists, battens or decking.',
      'Enter the span, spacing and quantity of pieces.',
      'The calculator totals the linear metres and suggests the most efficient stock lengths.',
      'Add a small cutting allowance for onsite trimming.',
    ],
    projects: [
      { title: '4 m × 3 m deck frame', description: 'Needs roughly 35 linear metres of joist timber at 400 mm centres.' },
      { title: '10 m stud wall', description: 'Needs about 35 linear metres of CLS or C16 stud timber.' },
      { title: '20 m² roof battens', description: 'Needs roughly 80 linear metres of 25 mm × 38 mm battens at 300 mm centres.' },
    ],
    faqs: [
      { q: 'What grade timber do I need for joists?', a: 'C24 carcassing timber is the common structural grade for floor joists, rafters and beams.' },
      { q: 'What centres should I use for deck joists?', a: '400 mm centres are standard for domestic decking. Use 300 mm centres for thinner boards or a stiffer feel.' },
      { q: 'Can you cut timber to length?', a: 'Yes. The trade counter can cut carcassing timber, CLS and sheet materials to a cutting list while you wait.' },
    ],
  },
  STEEL_LINTEL: {
    intro:
      'Estimate the lintel or steel beam size for an opening. Enter the structural opening width, load and wall construction and the calculator suggests the lintel length or steel section you need to discuss with the trade counter.',
    howTo: [
      'Measure the structural opening width in millimetres.',
      'Add the required end bearing — usually 150 mm each side for lintels.',
      'Select the wall type: cavity, solid or timber frame.',
      'The calculator returns the minimum lintel length and a note for steel beams.',
    ],
    projects: [
      { title: '1.8 m cavity-wall opening', description: 'Needs a 2.1 m standard cavity lintel with 150 mm bearings.' },
      { title: '3 m back-door opening', description: 'Needs a lintel length of 3.3 m plus consideration of the load above.' },
      { title: '4 m steel beam span', description: 'Needs a structural engineer’s calculation for the correct UB or RSJ size.' },
    ],
    faqs: [
      { q: 'How much end bearing does a lintel need?', a: 'A minimum of 150 mm bearing each side is typical for cavity lintels. Wider openings or heavier loads may need more.' },
      { q: 'What is the difference between a lintel and a beam?', a: 'A lintel is a pre-formed section that supports masonry over a small opening. A beam is a larger structural member designed by an engineer for bigger spans or heavier loads.' },
      { q: 'Do you cut steel to length?', a: 'Yes. We can cut standard lintels and steel sections to length. Bespoke beams are sourced through a local fabricator.' },
    ],
  },
}

export function getCalculatorTypeContent(type: CalculatorType): CalculatorTypeContent {
  return CALCULATOR_TYPE_CONTENT[type]
}
