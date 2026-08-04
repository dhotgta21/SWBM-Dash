// lib/calculators/extras.ts
// Common-project examples and FAQs for each standalone calculator page.
// Centralised so the content is easy to maintain and the page files stay
// focused on the interactive tool.

import type { CalculatorFaq, CalculatorProject } from '@/components/calculators/CalculatorExtras'

export interface CalculatorExtraContent {
  readonly commonProjects: readonly CalculatorProject[]
  readonly faqs: readonly CalculatorFaq[]
}

export const CALCULATOR_EXTRAS: Record<string, CalculatorExtraContent> = {
  'concrete-calculator': {
    commonProjects: [
      {
        name: '100 mm garage slab',
        description:
          'A 4 m × 6 m base needs roughly 2.4 m³ of ready-mix concrete before wastage.',
      },
      {
        name: 'Strip footing run',
        description:
          '450 mm wide × 300 mm deep for a 10 m run needs about 1.35 m³ of concrete.',
      },
      {
        name: '300 mm square column',
        description:
          'A 300 mm × 300 mm column filled to 2.5 m takes around 0.23 m³.',
      },
      {
        name: 'Pad foundation',
        description:
          'A 1 m × 1 m × 500 mm pad foundation needs roughly 0.5 m³ of concrete.',
      },
      {
        name: 'Shed base',
        description:
          'A 2 m × 2 m × 100 mm shed base needs about 0.4 m³ plus a small wastage allowance.',
      },
    ],
    faqs: [
      {
        question: 'How do I calculate concrete volume?',
        answer:
          'Multiply length × width × depth in metres. The result is the volume in cubic metres (m³).',
      },
      {
        question: 'How much wastage should I add?',
        answer:
          'Allow 5–10% for slabs and 10% for footings and columns to cover spillage, over-excavation and pump losses.',
      },
      {
        question: 'What concrete mix do I need?',
        answer:
          'C20 or C25 is typical for domestic slabs and footings. C30/C35 is used for structural work. Always confirm the mix strength with your engineer or building control.',
      },
      {
        question: 'Can I order less than 1 m³?',
        answer:
          'Most ready-mix suppliers have a minimum order and may charge a part-load fee for small volumes. It is often more cost-effective to combine pours.',
      },
      {
        question: 'How many 25 kg cement bags are in 1 m³ of concrete?',
        answer:
          'For site-mixed concrete, roughly 12–14 bags of 25 kg cement are needed per cubic metre, depending on the mix ratio and aggregate size.',
      },
    ],
  },
  'paving-calculator': {
    commonProjects: [
      {
        name: '4 m × 5 m patio',
        description:
          'Using 600 × 600 mm slabs: roughly 36 slabs, 2 tonnes of MOT Type 1 and 0.5 tonnes of sharp bedding sand.',
      },
      {
        name: '3 m × 6 m driveway',
        description:
          'Heavy-duty slabs need roughly 18 slabs, 2.5 tonnes of MOT Type 1 and 0.6 tonnes of bedding sand.',
      },
      {
        name: '1.2 m × 10 m garden path',
        description:
          'Using 450 × 450 mm slabs: roughly 30 slabs plus sub-base and bedding for the full length.',
      },
      {
        name: '2 m × 3 m utility area',
        description:
          'Approximately 10 large-format slabs, 1 tonne of MOT Type 1 and 0.25 tonnes of bedding sand.',
      },
    ],
    faqs: [
      {
        question: 'How deep should the MOT Type 1 sub-base be?',
        answer:
          'Allow 100 mm for patios on well-drained ground and 150 mm for driveways or areas with poor drainage.',
      },
      {
        question: 'How much bedding sand do I need?',
        answer:
          'A screeded bed of 25–50 mm sharp sand is typical. The calculator returns the volume in tonnes based on your area.',
      },
      {
        question: 'What wastage should I allow for paving?',
        answer:
          'Order 10% extra slabs to cover cuts, breakages and future repairs.',
      },
      {
        question: 'Can I use this calculator for block paving?',
        answer:
          'Yes. Enter the block size — a standard 200 × 100 mm block gives exactly 50 blocks per m².',
      },
      {
        question: 'Do I need edge restraints?',
        answer:
          'Yes. Driveways, raised patios and any paved surface subject to vehicle or foot traffic should have edge restraints to prevent spreading.',
      },
    ],
  },
  'tile-calculator': {
    commonProjects: [
      {
        name: 'Bathroom floor',
        description:
          'A 2 m × 3 m floor laid with 300 × 300 mm tiles needs roughly 70 tiles before wastage.',
      },
      {
        name: 'Kitchen splashback',
        description:
          'A 3 m × 0.6 m splashback with 100 × 300 mm tiles needs roughly 60 tiles.',
      },
      {
        name: 'Hallway floor',
        description:
          'A 1.5 m × 5 m hallway with 600 × 600 mm tiles needs roughly 22 tiles before cuts.',
      },
      {
        name: 'Utility room',
        description:
          'A 2 m × 2.5 m floor with 400 × 400 mm tiles needs roughly 35 tiles.',
      },
    ],
    faqs: [
      {
        question: 'How much tile wastage should I allow?',
        answer:
          'Allow 10% for straight layouts, 15% for diagonal or brick-bond patterns, and up to 20% for mosaic or large-format boards.',
      },
      {
        question: 'Does the calculator include grout?',
        answer:
          'No. Use the coverage calculator to estimate tile adhesive and grout separately.',
      },
      {
        question: 'Should I round up to full boxes?',
        answer:
          'Yes. The calculator returns the tile count, but you should order full boxes and keep one box unopened for future repairs.',
      },
      {
        question: 'Do large-format tiles need more wastage?',
        answer:
          'Yes. Large boards often need wet cutting and back-buttering, so allow at least 15% wastage.',
      },
      {
        question: 'Why keep a spare box of tiles?',
        answer:
          'Tile batches can vary in shade. Keeping a full box ensures repairs later match the original installation.',
      },
    ],
  },
  'mortar-calculator': {
    commonProjects: [
      {
        name: 'Single-skin brick wall',
        description:
          '10 m² of single-skin brickwork needs roughly 25–30 kg of cement plus the matching sand.',
      },
      {
        name: '100 mm block wall',
        description:
          '15 m² of 100 mm blockwork needs roughly 10–12 bags of 25 kg cement.',
      },
      {
        name: 'Repointing',
        description:
          '20 m² of repointing needs roughly 3–4 bags of cement depending on joint depth and width.',
      },
      {
        name: 'Garden wall',
        description:
          'A 5 m × 1 m single-skin garden wall needs roughly 5–6 bags of 25 kg cement.',
      },
    ],
    faqs: [
      {
        question: 'What mix ratio should I use for brickwork?',
        answer:
          'A 1:5 cement-to-sand mix is standard for general above-ground brickwork. Use 1:4 below the damp-proof course or in exposed positions.',
      },
      {
        question: 'How much sand do I need per bag of cement?',
        answer:
          'For a 1:5 mix, combine one 25 kg bag of cement with roughly 125 kg (5 bags) of sharp sand.',
      },
      {
        question: 'Should I add lime or plasticiser?',
        answer:
          'Lime improves workability and breathability for older brickwork. A mortar plasticiser is a common alternative for modern masonry.',
      },
      {
        question: 'When is a 1:6 mortar mix used?',
        answer:
          'A 1:6 mix is weaker and more breathable. It suits internal blockwork, soft brick or stone repointing.',
      },
      {
        question: 'How do I calculate mortar for blockwork?',
        answer:
          'Enter the wall area, block size and joint thickness. The calculator converts this into litres of wet mortar and then into cement bags and sand.',
      },
    ],
  },
  'plaster-calculator': {
    commonProjects: [
      {
        name: 'Skim two walls',
        description:
          'Two walls each 3 m × 2.4 m give roughly 15 m² and need about 2 bags of finish plaster.',
      },
      {
        name: 'Plasterboard ceiling',
        description:
          'A 4 m × 5 m ceiling needs roughly 7 sheets of 2.4 m × 1.2 m plasterboard.',
      },
      {
        name: 'Render 10 m² of blockwork',
        description:
          'Two-coat render on 10 m² of blockwork needs roughly 5–6 bags of render.',
      },
      {
        name: 'Patch repair',
        description:
          'A 2 m² patch repair usually needs about one 25 kg bag of finish plaster.',
      },
    ],
    faqs: [
      {
        question: 'How many square metres does a 25 kg bag of plaster cover?',
        answer:
          'A 25 kg bag of finish plaster covers roughly 10 m² at a 2–3 mm skim thickness.',
      },
      {
        question: 'What is the difference between plaster and render?',
        answer:
          'Plaster is for internal walls and ceilings. Render is applied externally to protect walls from the weather.',
      },
      {
        question: 'Do I need PVA or a bonding agent?',
        answer:
          'High-suction backgrounds such as bare blockwork usually need a coat of PVA or a bonding agent to control suction and improve adhesion.',
      },
      {
        question: 'How thick should a skim coat be?',
        answer:
          'A skim coat over plasterboard is normally 2–3 mm. Two-coat work on blockwork is 11 mm backing plus a 2 mm skim.',
      },
      {
        question: 'Can I plaster over painted walls?',
        answer:
          'Gloss or sealed paint must be sanded or treated with a bonding agent. PVA is often used to key the surface before skimming.',
      },
    ],
  },
  'coverage-calculator': {
    commonProjects: [
      {
        name: 'Emulsion room',
        description:
          'Four walls 4 m × 2.4 m give roughly 38 m² and need about 4 litres of emulsion per coat.',
      },
      {
        name: 'Masonry paint',
        description:
          '20 m² of rough render needs roughly 5 litres of masonry paint for one coat.',
      },
      {
        name: 'Tile adhesive',
        description:
          '10 m² of 200 mm floor tiles with a 10 mm notch trowel needs roughly 40 kg of adhesive.',
      },
      {
        name: 'Grout',
        description:
          '15 m² of 300 mm tiles with 5 mm joints needs roughly 8 kg of cement-based grout.',
      },
    ],
    faqs: [
      {
        question: 'Where do I find the coverage rate?',
        answer:
          'Coverage rates are printed on the product label or manufacturer data sheet. The calculator also pre-loads common rates for popular products.',
      },
      {
        question: 'Does the calculator account for multiple coats?',
        answer:
          'Yes. Enter the number of coats and the calculator multiplies the single-coat figure accordingly.',
      },
      {
        question: 'What about porous surfaces?',
        answer:
          'Porous or textured surfaces absorb more product. Add 10–20% to the calculator result for masonry paint, render or primer on bare substrates.',
      },
      {
        question: 'Does the result include primer?',
        answer:
          'No. Prime separately using the same coverage method, as primer often has a different spread rate to the topcoat.',
      },
      {
        question: 'What units does the calculator return?',
        answer:
          'It returns litres for liquids such as paint and sealant, and kilograms for adhesives, grouts and cement-based products.',
      },
    ],
  },
  'unit-converter': {
    commonProjects: [
      {
        name: 'Timber length',
        description: '3 metres of timber is approximately 9.84 feet.',
      },
      {
        name: 'Floor area',
        description: '20 m² of flooring is approximately 215 ft².',
      },
      {
        name: 'Concrete volume',
        description: '5 m³ of ready-mix concrete is approximately 6.54 cubic yards.',
      },
      {
        name: 'Aggregate weight',
        description: '1,000 kg of aggregate equals 1 metric tonne.',
      },
      {
        name: 'Temperature',
        description: '20°C is 68°F.',
      },
    ],
    faqs: [
      {
        question: 'How accurate is the converter?',
        answer:
          'Results are rounded to four significant figures, which is accurate enough for quoting and ordering building materials.',
      },
      {
        question: 'Can it convert tonnes to cubic metres?',
        answer:
          'No. That conversion needs the material density, which varies between aggregates, sands and concrete.',
      },
      {
        question: 'What categories are supported?',
        answer:
          'Length, area, volume, weight, pressure and temperature are all built in.',
      },
      {
        question: 'Can I swap the from/to units?',
        answer:
          'Yes. Use the swap button to reverse a conversion without retyping the value.',
      },
      {
        question: 'Does it work on mobile?',
        answer:
          'Yes. The converter is responsive and works on phones, tablets and desktops without any app install.',
      },
    ],
  },
}
