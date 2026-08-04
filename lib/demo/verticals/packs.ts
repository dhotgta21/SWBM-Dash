import type { DemoVerticalId, DemoVerticalPack } from './types'

export const VERTICAL_PACKS: Record<DemoVerticalId, DemoVerticalPack> = {
  construction: {
    id: 'construction',
    displayName: 'Construction & Builders Merchant',
    heroLead: 'Builders merchant delivering across',
    heroEmphasis: 'the South East',
    heroBody:
      'Aggregates, bricks, timber, insulation, roofing, drainage and fixings for trade accounts. Same-day lorries, trade counter service, and professional invoices built for busy sites.',
    trustHeadline: 'Why builders choose a modern merchant platform',
    categories: [
      'Aggregates & Cement',
      'Bricks',
      'Blocks',
      'Timber',
      'Plasterboard',
      'Cavity Insulation',
      'Roofing',
      'Drainage',
      'Fixings',
      'Tools',
    ],
    faqs: [
      {
        question: 'Can I open a trade account?',
        answer:
          'Yes. Apply online or speak to the trade counter. Credit terms are set per account and show on every invoice.',
      },
      {
        question: 'Do you deliver to site?',
        answer:
          'Yes. Delivery and collection are both supported. Orders can be scheduled around pour days and scaffold windows.',
      },
      {
        question: 'Can I request a quote online?',
        answer:
          'Use the catalogue and quote cart to send a line list. Staff convert quotes into invoices in the dashboard.',
      },
    ],
    keywords: ['builders merchant', 'building materials', 'aggregates', 'timber'],
    quoteCta: 'Build a trade quote for your next site drop',
  },
  plumbing: {
    id: 'plumbing',
    displayName: 'Plumbing Merchant',
    heroLead: 'Plumbing supplies for',
    heroEmphasis: 'trade installers',
    heroBody:
      'Pipes, fittings, valves, cylinders and heating accessories with trade pricing, job-ready invoices, and delivery to the job or collection from the counter.',
    trustHeadline: 'Built for plumbing and heating contractors',
    categories: [
      'Copper Tube & Fittings',
      'Plastic Pipe Systems',
      'Valves & Controls',
      'Heating & Cylinders',
      'Sanitaryware Trade',
      'Tools',
      'Fixings',
      'Miscellaneous',
    ],
    faqs: [
      {
        question: 'Do you stock common pipe sizes?',
        answer:
          'Yes. Core copper and plastic systems are listed in the catalogue with units trade teams expect on invoices.',
      },
      {
        question: 'Can vans collect same day?',
        answer:
          'Collection and delivery are both supported so engineers can keep multiple jobs moving.',
      },
      {
        question: 'How do quotes work for multi-job accounts?',
        answer:
          'Each job can carry its own reference. History stays on the client record for two-plus years in this demo.',
      },
    ],
    keywords: ['plumbing merchant', 'copper fittings', 'heating supplies', 'trade plumbing'],
    quoteCta: 'Quote plumbing materials for your next install',
  },
  electrical: {
    id: 'electrical',
    displayName: 'Electrical Wholesaler',
    heroLead: 'Electrical supplies for',
    heroEmphasis: 'contractors & electricians',
    heroBody:
      'Cable, containment, switchgear accessories, lighting and fixings with clear catalogue codes, VAT-ready invoices, and account history that mirrors real project work.',
    trustHeadline: 'A dashboard electricians can trust on site',
    categories: [
      'Cable & Flex',
      'Containment',
      'Switchgear & Boards',
      'Lighting Trade',
      'Wiring Accessories',
      'Tools',
      'Fixings',
      'Miscellaneous',
    ],
    faqs: [
      {
        question: 'Can I search by product code?',
        answer:
          'Yes. Catalogue search and invoice lines carry product codes so re-orders match what was fitted last time.',
      },
      {
        question: 'Is VAT handled correctly on mixed baskets?',
        answer:
          'Line-level VAT rolls into document totals the same way as a production merchant system.',
      },
      {
        question: 'Can site managers see past orders?',
        answer:
          'Client history and optional portal access keep previous jobs easy to re-order from.',
      },
    ],
    keywords: ['electrical wholesaler', 'cable', 'switchgear', 'trade electrical'],
    quoteCta: 'Build an electrical materials quote',
  },
  windows: {
    id: 'windows',
    displayName: 'Windows & Doors Merchant',
    heroLead: 'Windows, doors and hardware for',
    heroEmphasis: 'installers',
    heroBody:
      'Trade-focused catalogue for frames, glass packs, hardware and sealants with professional quotations, staged deliveries, and clean invoice PDFs for homeowners and main contractors.',
    trustHeadline: 'From survey to install without spreadsheet chaos',
    categories: [
      'uPVC Frames',
      'Aluminium Systems',
      'Glass & Glazing',
      'Hardware & Handles',
      'Sealants & Fixings',
      'Tools',
      'Miscellaneous',
    ],
    faqs: [
      {
        question: 'Can I issue a quotation before manufacture?',
        answer:
          'Yes. Quotations convert to invoices when the order is firm, keeping document numbers clean.',
      },
      {
        question: 'Do delivery notes support install days?',
        answer:
          'Delivery method and site address sit on each document so drops match scaffold slots.',
      },
      {
        question: 'Will this work for a multi-crew installer?',
        answer:
          'Each client account holds years of order history so office staff can re-pick previous packages.',
      },
    ],
    keywords: ['windows merchant', 'doors trade', 'glazing supplies', 'uPVC'],
    quoteCta: 'Quote frames, glass and hardware',
  },
  tile: {
    id: 'tile',
    displayName: 'Tile & Flooring Merchant',
    heroLead: 'Tiles, adhesives and tools for',
    heroEmphasis: 'tilers & flooring trades',
    heroBody:
      'Porcelain, ceramic, natural stone samples in the demo catalogue plus adhesives, grouts and trims. Invoices and client history show how a specialist merchant runs day to day.',
    trustHeadline: 'Specialist merchant workflows, general-purpose platform',
    categories: [
      'Porcelain Tiles',
      'Ceramic Tiles',
      'Natural Stone',
      'Adhesives & Grouts',
      'Trims & Profiles',
      'Tools',
      'Miscellaneous',
    ],
    faqs: [
      {
        question: 'Can I mix tiles and adhesives on one invoice?',
        answer:
          'Yes. Line items support mixed baskets with clear units and VAT.',
      },
      {
        question: 'How do repeat trade customers appear?',
        answer:
          'Hot accounts order weekly in the demo data; quieter accounts order monthly so charts look realistic.',
      },
      {
        question: 'Is there a tile calculator?',
        answer:
          'The tools area includes a tile calculator that pairs with catalogue products on the construction pack; other verticals use the same quote flow.',
      },
    ],
    keywords: ['tile merchant', 'porcelain tiles', 'adhesives', 'trade tiling'],
    quoteCta: 'Quote tiles and fixing systems',
  },
}

export const VERTICAL_IDS = Object.keys(VERTICAL_PACKS) as DemoVerticalId[]

export function getVerticalPack(id: string | null | undefined): DemoVerticalPack {
  const key = (id || 'construction').toLowerCase() as DemoVerticalId
  return VERTICAL_PACKS[key] || VERTICAL_PACKS.construction
}
