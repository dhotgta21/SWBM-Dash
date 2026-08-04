// lib/seo/category-content.ts
// Definitional, citation-worthy copy for each stock category. AI answer
// engines (Gemini, Perplexity, ChatGPT) and Google's AI Overviews surface
// text that plainly states "what X is" and answers common questions, so
// each category gets a short factual intro plus a set of Q&As. Both are
// rendered visibly on the category page AND emitted as FAQPage JSON-LD.
//
// Content falls back to a generic, category-name-driven version for any
// category not explicitly listed, so new stock categories still get
// useful structured copy without a code change.

export interface CategoryFaq {
  q: string
  a: string
}

export interface CategoryContent {
  intro: string
  faqs: CategoryFaq[]
}

interface CategoryEntry {
  title: string
  intro: string
  faqs: CategoryFaq[]
}

const ENTRIES: Record<string, CategoryEntry> = {
  roofing: {
    title: 'Roofing',
    intro:
      'Roofing materials cover everything above the wall plate: pitched-roof coverings, flat-roof membranes, guttering, fascias and damp-proof courses. At a builders merchant these are sold by the length, sheet or pack, with weather-resistant uPVC, bitumen felt and galvanised fixings being the most common lines for both new-build and repair work.',
    faqs: [
      {
        q: 'What roofing materials does a builders merchant stock?',
        a: 'Typical lines include torch-on roofing felt and underlay, uPVC guttering and fascia systems, damp-proof course (DPC) and damp-proof membrane (DPM), breathable roof membranes, and the fixings needed to install them. These are sold by the length, sheet or pack.',
      },
      {
        q: 'What is the difference between a DPC and a DPM?',
        a: 'A damp-proof course (DPC) is a horizontal barrier built into a wall, usually 150mm wide, to stop moisture rising. A damp-proof membrane (DPM) is a thicker continuous sheet laid under a solid floor to stop ground moisture. Both are typically made from polyethylene.',
      },
      {
        q: 'Can roofing materials be delivered to site?',
        a: 'Yes. Long runs of guttering, fascia and membrane are delivered on our own lorries, with same-day delivery on stock lines across the core delivery area and next-day for outlying towns.',
      },
    ],
  },
  fixings: {
    title: 'Fixings',
    intro:
      'Fixings are the mechanical fasteners that hold a building together: wall ties, nails, screws, straps, brackets and hangers. They are specified by material (galvanised or stainless steel for corrosion resistance), length and head type, and are usually sold by the box or collated strip for nail and screw guns.',
    faqs: [
      {
        q: 'What fixings do I need for masonry walls?',
        a: 'Masonry cavity walls are tied with wall ties - commonly TT4 wall ties in 225mm or 275mm lengths depending on the cavity width. Galvanised or stainless steel ties are used for corrosion resistance, and restraint straps secure the wall to floors and roofs.',
      },
      {
        q: 'What length wall tie do I need?',
        a: 'Wall tie length is chosen from the cavity width plus the embedment in each leaf of masonry. A 225mm tie suits a standard 50-75mm cavity, while 275mm ties are used for wider cavities or thicker insulation.',
      },
      {
        q: 'What is the difference between galvanised and stainless fixings?',
        a: 'Galvanised steel is zinc-coated for general outdoor use. Stainless steel resists corrosion even in coastal or permanently damp conditions and is required where building regulations demand a longer design life.',
      },
    ],
  },
  'aggregates & cement': {
    title: 'Aggregates & Cement',
    intro:
      'Aggregates and cement are the bulk materials of construction: sand, ballast, gravel, Type 1 sub-base and general-purpose cement. Aggregates are sold by the tonne for bulk loads or in 25kg bags, while cement is supplied in weatherproof 25kg bags and mixed on site with sand and water to make concrete or mortar.',
    faqs: [
      {
        q: 'How is cement sold at a builders merchant?',
        a: 'General-purpose cement is sold in 25kg weatherproof bags. It is mixed on site with sharp sand and water to make mortar, or with ballast to make concrete. Bulk orders can be delivered on pallets.',
      },
      {
        q: 'Do you sell aggregates by the tonne?',
        a: 'Yes. Sharp sand, ballast, gravel and Type 1 sub-base are stocked by the tonne for bulk delivery, with smaller quantities available in 25kg bags. Bulk loads are tipped by our delivery lorries.',
      },
      {
        q: 'What is Type 1 sub-base used for?',
        a: 'Type 1 is a graded granular sub-base used under driveways, paths and floor slabs. It is compacted in layers to form a stable, free-draining base before the surface is laid.',
      },
    ],
  },
  blocks: {
    title: 'Blocks',
    intro:
      'Concrete blocks are the standard masonry unit for load-bearing walls, partitions and structural infill. They are specified by strength (typically 7.3N), density and thickness (commonly 100mm or 140mm), with dense, medium-dense and aircrete options chosen for strength, thermal or acoustic performance.',
    faqs: [
      {
        q: 'What is the difference between dense and aircrete blocks?',
        a: 'Dense concrete blocks (around 7.3N) are high-strength and used for load-bearing and structural walls. Aircrete blocks are lighter with better thermal and acoustic insulation, and are used for non-load-bearing partitions and inner leaves.',
      },
      {
        q: 'What strength block do I need?',
        a: 'A 7.3N dense concrete block is the standard choice for load-bearing walls, retaining walls and cavity wall construction. Lower-strength or aircrete blocks are used where insulation matters more than compressive strength.',
      },
      {
        q: 'What block thicknesses are available?',
        a: 'Common thicknesses are 100mm for standard partition and cavity work and 140mm for thicker structural walls. Hollow 215mm concrete blocks are also stocked for larger masonry units.',
      },
    ],
  },
  'sheet materials': {
    title: 'Sheet Materials',
    intro:
      'Sheet materials are the engineered wood panels used for flooring, roofing, wall sheathing and formwork: OSB3, moisture-resistant chipboard (P5), softwood shuttering plywood and hardwood plywood. They are sold in standard 8x4 sheets (2440x1220mm) and specified by thickness, such as 18mm for flooring.',
    faqs: [
      {
        q: 'What is the difference between OSB3 and plywood?',
        a: 'OSB3 is an oriented strand board rated for load-bearing use in humid conditions - a cost-effective choice for flooring and sheathing. Plywood is made of thin wood veneers bonded together and is preferred for shuttering and where a smoother face is needed.',
      },
      {
        q: 'Which sheet material is used for flooring?',
        a: 'P5 moisture-resistant chipboard (commonly 18mm or 22mm tongue-and-groove) is the standard flooring deck. OSB3 18mm is also used for flat roof decking and general structural panels.',
      },
      {
        q: 'What size are sheet materials sold in?',
        a: 'Most panels are sold as 8x4 sheets (2440x1220mm), with some lines such as 18mm T&G OSB3 available in 2400x600mm. Thicknesses range from 11mm to 22mm depending on the application.',
      },
    ],
  },
  timber: {
    title: 'Timber',
    intro:
      'Structural and treated timber is sold by the builders merchant for framing, roofing, flooring and finishing. Carcassing timber is strength-graded (C24 is the common structural grade), while BS-graded treated battens are used for roofing and cladding. Lengths typically run from 2.4m up to 7.2m.',
    faqs: [
      {
        q: 'What does C24 timber mean?',
        a: 'C24 is a strength grade assigned to machine-graded carcassing timber under BS EN 338. It is stronger and stiffer than C16 and is the standard choice for floor joists, roof rafters and structural beams.',
      },
      {
        q: 'Do you cut timber to size?',
        a: 'Yes. The trade saw bench cuts carcassing timber, CLS, OSB, plywood and MDF to a cutting list while you wait, so material arrives on site ready to fix.',
      },
      {
        q: 'What timber lengths are available?',
        a: 'Common carcassing lengths run from 2.4m to 7.2m in 300mm increments. Treated roofing battens are typically stocked in 3.6m and 4.8m lengths.',
      },
    ],
  },
  'cavity insulation': {
    title: 'Cavity Insulation',
    intro:
      'Cavity insulation and membranes improve the thermal and acoustic performance of a cavity wall. Full-fill or partial-fill insulation boards sit between the two masonry leaves, while breathable membranes and cavity closers seal the cavity at openings to prevent cold bridging and moisture tracking.',
    faqs: [
      {
        q: 'What is a cavity closer used for?',
        a: 'A cavity closer seals the cavity at window and door openings. It prevents cold bridging, stops moisture tracking across the cavity, and provides a tidy edge for fitting frames.',
      },
      {
        q: 'What does a breathable roof membrane do?',
        a: 'A breathable membrane allows water vapour to escape from the roof space while keeping liquid water out, reducing condensation risk in both warm and cold roof constructions.',
      },
      {
        q: 'How is cavity insulation installed?',
        a: 'Rigid insulation boards are fixed against the inner leaf as the wall is built (partial fill) or fill the full cavity width. The outer leaf and ties are then built up, with a cavity closer at every opening.',
      },
    ],
  },
  'steel & lintels': {
    title: 'Steel & Lintels',
    intro:
      'Structural steel and lintels span openings and carry load above doors, windows and wide bays. Universal beams (UB), universal columns (UC), parallel flange channels (PFC), square hollow section (SHS) and equal angle are supplied in mild steel, while lintels and catnic-style sections support masonry over openings.',
    faqs: [
      {
        q: 'What is the difference between a universal beam and a universal column?',
        a: 'A universal beam (UB) is designed to carry load primarily in bending across a span, so it is deeper than it is wide. A universal column (UC) is squarer in proportion and used where compression or column loading dominates.',
      },
      {
        q: 'What steel section is used for a load-bearing frame?',
        a: 'Universal columns and square hollow sections are common for vertical posts, while universal beams and parallel flange channels carry the horizontal spans. Equal angle is used for bracing and secondary framing.',
      },
      {
        q: 'Can steel beams be cut to length?',
        a: 'Yes. Beams are supplied cut to the specified length for the opening, ready for the builder to crane into position. Galvanised or primed finishes are available where corrosion protection is required.',
      },
    ],
  },
  plasterboard: {
    title: 'Plasterboard',
    intro:
      'Plasterboard and plaster are used to form smooth internal walls and ceilings. Plasterboards are sold in standard sheets and specified by performance - moisture-resistant, fire-rated or thermal laminate - while bonding coats, base coats and multi-finish gypsum plaster provide the final skim.',
    faqs: [
      {
        q: 'What plaster do I need for a smooth finish?',
        a: 'A typical two-coat system uses a bonding or base coat (such as a hardwall or bonding coat) followed by a multi-finish gypsum plaster skimmed to a smooth surface on walls and ceilings.',
      },
      {
        q: 'What is the difference between standard and moisture-resistant plasterboard?',
        a: 'Moisture-resistant plasterboard has a water-repellent core and face for kitchens, bathrooms and high-humidity areas. Standard wallboard is used for dry internal partitions and ceilings.',
      },
      {
        q: 'What is thermal plasterboard laminate?',
        a: 'Thermal laminate plasterboard bonds a sheet of insulation (often PIR) to a plasterboard face, improving the U-value of a wall or ceiling without a separate insulation layer.',
      },
    ],
  },
  bricks: {
    title: 'Bricks',
    intro:
      'Bricks are the standard masonry unit for walls, facades and restoration work. Facing bricks are chosen for appearance, while engineering bricks are specified for strength and damp resistance. Bricks are sold by the pack, with common dimensions of 215 x 102.5 x 65 mm.',
    faqs: [
      {
        q: 'What is the difference between facing bricks and engineering bricks?',
        a: 'Facing bricks are selected for their appearance and used on external walls. Engineering bricks are dense, high-strength and low-water-absorption, used for manholes, sewers, retaining walls and damp-proof courses.',
      },
      {
        q: 'How many bricks are in a pack?',
        a: 'A standard pack of facing bricks is usually 390, 400 or around 500 depending on the manufacturer and brick size. Check the product detail for the exact pack quantity.',
      },
      {
        q: 'Can bricks be delivered to site?',
        a: 'Yes. Bricks are delivered on pallets by our own lorries, with same-day delivery available on stock lines across the core delivery area.',
      },
    ],
  },
  'pir insulation': {
    title: 'PIR Insulation',
    intro:
      'PIR (polyisocyanurate) insulation boards are rigid, high-performance boards used to improve thermal efficiency in roofs, floors and walls. They offer a better U-value than many alternatives in a slim build-up and are often foil-faced to act as a vapour control layer.',
    faqs: [
      {
        q: 'Where is PIR insulation used?',
        a: 'PIR boards are commonly used in pitched roofs, flat roofs, floors, walls and loft conversions where space is limited and a high thermal performance is needed.',
      },
      {
        q: 'What thicknesses of PIR insulation are available?',
        a: 'PIR boards are stocked in a range of thicknesses, typically from 25 mm up to 150 mm, so you can meet building regulation U-values without excessive build-up.',
      },
      {
        q: 'Is PIR insulation the same as polystyrene?',
        a: 'No. PIR is a different chemistry from expanded polystyrene (EPS) and generally gives a better U-value for the same thickness. EPS is often used where cost is the priority and space is less constrained.',
      },
    ],
  },
  'bright steel': {
    title: 'Bright Steel',
    intro:
      'Bright steel is cold-drawn or cold-rolled mild steel with a smooth, accurate finish and closer dimensional tolerances than black steel. It is used where the surface finish, straightness or machinability matters: shafts, pins, spindles, frames, brackets and architectural metalwork. We stock bright round bar, flat bar, angle and square bar in standard lengths, with cutting service available for trade and fabrication customers.',
    faqs: [
      {
        q: 'What is the difference between bright steel and black steel?',
        a: 'Bright steel is cold-finished, giving a smooth surface and tighter tolerances. Black steel is hot-rolled with a dark oxide scale and is used where exact dimensions and appearance are less critical.',
      },
      {
        q: 'What bright steel sections do you stock?',
        a: 'We stock bright round bar, flat bar, square bar and equal angle in common sizes. Longer lengths or non-standard sections can usually be sourced quickly through our supplier network.',
      },
      {
        q: 'Can bright steel be cut to length?',
        a: 'Yes. We can cut standard 6 m lengths to the sizes you need, either at the trade counter or as part of a delivered order. Send us a cutting list with your quote request.',
      },
    ],
  },
}

function categoryKey(category: string): string {
  return category.toLowerCase().replace(/\s+/g, ' ').trim()
}

/**
 * Returns the definitional intro + FAQ set for a category. Falls back to a
 * generic but still-useful set built from the category name so any new
 * stock category gets structured, citation-friendly copy automatically.
 */
export function getCategoryContent(category: string | null | undefined): CategoryContent {
  if (!category) {
    return {
      intro:
        'A stocked category of building materials available for trade and DIY, sold by the unit or pack and delivered across the core service area.',
      faqs: [
        {
          q: 'Can I order these materials for delivery?',
          a: 'Yes. Add the lines you need to a quote list and send it through. We come back the same business day with trade prices and a delivery slot for your area.',
        },
        {
          q: 'Do you sell to both trade and DIY?',
          a: 'Yes. The trade counter and online catalogue serve both trade accounts and DIY customers, with volume pricing available on bulk orders.',
        },
      ],
    }
  }

  const entry = ENTRIES[categoryKey(category)]
  if (entry) {
    return { intro: entry.intro, faqs: entry.faqs }
  }

  const lower = category.toLowerCase()
  return {
    intro: `${category} is a stocked category of building materials at Star Hawk Builders Merchant, sold by the unit or pack and available for same-day delivery on stock lines across the core service area. We keep the common trade lines on the shelf and can source specialist sizes or grades through our supplier network with short lead times. Add the lines you need to a quote list for trade pricing and we will come back the same business day with stock confirmation and a delivery slot.`,
    faqs: [
      {
        q: `Do you stock ${lower} for trade and DIY?`,
        a: `Yes. ${category} lines are stocked in depth and sold to both trade accounts and DIY customers. Add the items you need to a quote list and send it through for trade prices.`,
      },
      {
        q: `Can ${lower} be delivered to site?`,
        a: `Yes. Stock lines are delivered same-day across the core delivery area, with next-day delivery to outlying towns. Delivery is on our own lorries.`,
      },
      {
        q: `How do I get a trade price for ${lower}?`,
        a: `Add the products and quantities you need to a quote list, or send your schedule through by email. We check stock, apply trade pricing and reply with a written quote and delivery option for your postcode.`,
      },
    ],
  }
}
