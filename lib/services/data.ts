// lib/services/data.ts
// Trade service pages for the builders merchant. Each service gets its own
// crawlable URL at /services/{slug} with unique metadata, structured data and
// enough content to avoid the "thin page" flag.

export interface ServiceProcessStep {
  readonly title: string
  readonly description: string
}

export interface ServiceFaq {
  readonly question: string
  readonly answer: string
}

export interface ServicePage {
  readonly slug: string
  readonly title: string
  readonly shortTitle: string
  readonly heading: string
  readonly description: string
  readonly intro: string
  readonly features: readonly string[]
  readonly benefits: readonly string[]
  readonly process: {
    readonly title?: string
    readonly steps: readonly ServiceProcessStep[]
  }
  readonly faqs: readonly ServiceFaq[]
  /** Lucide icon name used on cards and hero. */
  readonly icon: 'layers' | 'clipboard-list' | 'truck' | 'credit-card'
  readonly cta: {
    readonly label: string
    readonly href: string
  }
}

export const SERVICES: ServicePage[] = [
  {
    slug: 'brick-matching',
    title: 'Brick Matching Service | Demo Builder Merchant',
    shortTitle: 'Brick matching',
    icon: 'layers',
    heading: 'Brick matching that keeps your build consistent.',
    description:
      'Find the closest match for existing brickwork. Our brick matching service compares colour, texture, size and finish across facing and engineering bricks.',
    intro:
      'Whether you are extending an existing property, repairing damage or blending new brickwork into an older elevation, our brick matching service helps you find the closest available brick for colour, texture, size and finish. We compare samples against our stocked ranges and can source specialist facing bricks when a closer match is needed.',
    features: [
      'Free sample comparison against existing brickwork',
      'Facing bricks, engineering bricks and reclaimed-style options',
      'Advice on mortar colour and joint finish for a seamless blend',
      'Sourcing of non-stock lines from UK manufacturers',
      'Trade pricing and bulk discounts available',
    ],
    benefits: [
      'Avoid costly colour mismatches on extensions and repairs',
      'Access stock and special-order bricks from a single supplier',
      'Get mortar and jointing advice for a seamless blend',
      'Receive trade pricing on bulk and repeat orders',
      'Turn samples into a delivered quote in one visit or call',
    ],
    process: {
      title: 'How brick matching works',
      steps: [
        {
          title: 'Send or bring your sample',
          description:
            'Drop a sample brick into the yard, email clear photos with dimensions, or call us to arrange a site visit for larger projects.',
        },
        {
          title: 'Compare against our stock',
          description:
            'We compare colour, texture, size and finish against the facing and engineering bricks we keep on the ground.',
        },
        {
          title: 'Source a closer match if needed',
          description:
            'If nothing in stock is close enough, we contact UK manufacturers and reclaimed-brick suppliers to find a better option.',
        },
        {
          title: 'Quote and deliver',
          description:
            'Once matched, we confirm quantities, wastage allowances and a delivery slot that fits your programme.',
        },
      ],
    },
    faqs: [
      {
        question: 'How long does brick matching take?',
        answer:
          'Most matches are confirmed within one working day if we have a comparable brick in stock. Special-order matches from manufacturers typically take 2–5 working days.',
      },
      {
        question: 'Do I need a whole brick to get a match?',
        answer:
          'A whole brick is best, but good photos with accurate dimensions and a description of mortar colour are often enough for an initial comparison.',
      },
      {
        question: 'Can you match reclaimed or handmade bricks?',
        answer:
          'Yes. We stock reclaimed-style and handmade options and can source specialist lines that mimic age, weathering and texture.',
      },
      {
        question: 'What if an exact match is not available?',
        answer:
          'We will recommend the closest available alternative and advise on mortar tinting, joint profiles or blending courses to disguise the difference.',
      },
      {
        question: 'Do you deliver matched bricks to site?',
        answer:
          'Yes. Once matched, we can deliver on our own lorries with crane or hi-ab offload across our full coverage area.',
      },
    ],
    cta: { label: 'Send a brick sample', href: '/quote' },
  },
  {
    slug: 'estimating',
    title: 'Take-Off & Estimating Service | Demo Builder Merchant',
    shortTitle: 'Take-off & estimating',
    icon: 'clipboard-list',
    heading: 'Accurate material estimates from your plans.',
    description:
      'Send your drawings and we will produce a detailed builders merchant estimate with quantities, alternatives and trade pricing for your project.',
    intro:
      'Upload your drawings, schedules or specifications and our team will produce a detailed material estimate for your project. We work from architects plans, structural drawings and site measurements to quantify bricks, blocks, timber, steel, insulation, plasterboard, roofing, fixings and finishing materials.',
    features: [
      'Estimates from PDF plans, DWG files or hand mark-ups',
      'Itemised quantities with product codes and alternatives',
      'Advice on wastage allowances and standard pack sizes',
      'Revisions as the design changes',
      'Linked directly to your trade account and delivery schedule',
    ],
    benefits: [
      'Reduce over-ordering and leftover material on site',
      'Compare product alternatives to hit budget or specification',
      'Lock trade pricing and delivery dates in one quote',
      'Update quantities free of charge when drawings change',
      'Work from any format: PDF, DWG, hand mark-ups or site notes',
    ],
    process: {
      title: 'How estimating works',
      steps: [
        {
          title: 'Send your drawings',
          description:
            'Email PDFs, DWG files or photos of hand mark-ups. Include specifications so we understand the required finishes and standards.',
        },
        {
          title: 'We review and measure',
          description:
            'Our estimator checks dimensions, counts openings and calculates areas to build accurate quantities from the plans.',
        },
        {
          title: 'Build the bill of materials',
          description:
            'We convert take-off quantities into product codes, pack sizes, wastage allowances and trade-priced alternatives where useful.',
        },
        {
          title: 'Revise as the design changes',
          description:
            'Issued a revised drawing? Send it over and we will update the estimate at no extra charge.',
        },
        {
          title: 'Lock the quote and schedule delivery',
          description:
            'Once you are happy, we convert the estimate into a firm quote with staged or consolidated delivery options.',
        },
      ],
    },
    faqs: [
      {
        question: 'What file formats can you estimate from?',
        answer:
          'PDF plans, DWG files, scanned hand mark-ups and site measurement notes are all fine. The clearer the dimensions, the faster we can turn it around.',
      },
      {
        question: 'How long does a builders merchant estimate take?',
        answer:
          'Small extensions and alterations are usually turned around within 24 hours. Larger new-build or multi-plot estimates take 2–3 working days.',
      },
      {
        question: 'Is there a charge for estimating?',
        answer:
          'Estimates are free for trade account holders and serious enquiries. We may ask for a small refundable deposit on very large or repeated tender revisions.',
      },
      {
        question: 'Can you price from site measurements instead of drawings?',
        answer:
          'Yes. Send clear site measurements and photos, or arrange for one of our team to visit the site for larger projects.',
      },
      {
        question: 'Do your estimates include wastage?',
        answer:
          'Yes. We add realistic wastage allowances based on the material type, pack size and site conditions so you are not caught short.',
      },
    ],
    cta: { label: 'Request an estimate', href: '/quote' },
  },
  {
    slug: 'site-delivery',
    title: 'Site Delivery Service | Demo Builder Merchant',
    shortTitle: 'Site delivery',
    icon: 'truck',
    heading: 'Reliable site delivery across the South East.',
    description:
      'Same-day and next-day delivery of building materials to site, including crane-offload, hi-ab and moffett options where access is tight.',
    intro:
      'We deliver aggregates, bricks, blocks, timber, steel, insulation, plasterboard and finishing materials directly to site across Greater London, Berkshire, Buckinghamshire, Surrey, Hampshire and Oxfordshire. Our drivers understand building sites: tight turns, restricted access and timed deliveries are routine for us.',
    features: [
      'Same-day delivery on stock lines for orders placed early',
      'Hi-ab, crane-offload and moffett deliveries available',
      'Timed slots to suit your programme',
      'Bulk aggregate and muck-away coordination',
      'Deliveries 6 days a week, including early starts',
    ],
    benefits: [
      'Keep your programme on track with reliable timed slots',
      'Avoid third-party courier delays with our own fleet',
      'Place bulk materials exactly where they are needed',
      'Tackle restricted access with crane, hi-ab or moffett offload',
      'Order by 11am for same-day stock-line delivery',
    ],
    process: {
      title: 'How site delivery works',
      steps: [
        {
          title: 'Place your order or call',
          description:
            'Order online, by phone or at the trade counter. Let us know the site address, access constraints and preferred time slot.',
        },
        {
          title: 'Confirm access and slot',
          description:
            'We check vehicle size, offload method and any site rules so the delivery arrives with the right kit and paperwork.',
        },
        {
          title: 'Load and dispatch',
          description:
            'Your materials are loaded on our own lorry, checked against the order and dispatched for the agreed slot.',
        },
        {
          title: 'Offload on site',
          description:
            'Our driver places the load where you need it using crane, hi-ab or tail-lift offload as arranged.',
        },
        {
          title: 'Sign-off and next load',
          description:
            'You sign the delivery note and we schedule the next drop or return for any additional items.',
        },
      ],
    },
    faqs: [
      {
        question: 'What areas do you deliver to?',
        answer:
          'We cover Greater London, Berkshire, Buckinghamshire, Surrey, Hampshire, Oxfordshire and Wiltshire. Core towns are typically same-day; outlying areas are next-day.',
      },
      {
        question: 'What is the cut-off time for same-day delivery?',
        answer:
          'Orders placed by 11:00am on stock lines usually qualify for same-day delivery, subject to route capacity and slot availability.',
      },
      {
        question: 'Do you deliver loose aggregates?',
        answer:
          'Yes. We can deliver loose aggregates by tipper or in bulk bags, with crane-offload available to place them exactly where needed.',
      },
      {
        question: 'Can you offload over a fence or wall?',
        answer:
          'Yes. Hi-ab and crane-offload options let us lift materials over fences, walls and into rear gardens or restricted sites.',
      },
      {
        question: 'What happens if the site is closed when you arrive?',
        answer:
          'We will call ahead and, if the site is inaccessible, reschedule the delivery. Redelivery charges may apply if the failure is not notified in advance.',
      },
    ],
    cta: { label: 'Book a delivery', href: '/quote' },
  },
  {
    slug: 'credit-accounts',
    title: 'Trade Credit Accounts | Demo Builder Merchant',
    shortTitle: 'Trade credit accounts',
    icon: 'credit-card',
    heading: 'Open a trade credit account today.',
    description:
      'Flexible trade credit for builders, developers and contractors. Apply online and get preferential pricing, dedicated support and monthly invoicing.',
    intro:
      'A Demo Builder Merchant trade credit account gives you flexible payment terms, preferential pricing and a dedicated account manager who understands your workflow. We support sole traders, limited companies and larger development firms with tailored credit limits and straightforward monthly statements.',
    features: [
      '30-day monthly terms for qualifying trade customers',
      'Preferential trade pricing on bulk and repeat orders',
      'Dedicated account manager and priority phone line',
      'Itemised monthly statements and credit-control support',
      'Quick online application with fast decisions',
    ],
    benefits: [
      'Improve cash flow with 30-day monthly terms',
      'Unlock trade pricing on high-volume or repeat orders',
      'Deal with one dedicated account manager who knows your jobs',
      'Track spend with clear, itemised monthly statements',
      'Apply quickly online with fast credit decisions',
    ],
    process: {
      title: 'How to open a trade credit account',
      steps: [
        {
          title: 'Apply online',
          description:
            'Complete the short application form with your business details, turnover and requested credit limit.',
        },
        {
          title: 'Credit check',
          description:
            'We run a standard trade-reference and credit check. Most decisions are made within one working day.',
        },
        {
          title: 'Set your limit',
          description:
            'Once approved, we confirm your credit limit, payment terms and dedicated account manager.',
        },
        {
          title: 'Start ordering',
          description:
            'Order by phone, online or at the trade counter and your purchases are added to your account.',
        },
        {
          title: 'Monthly statement',
          description:
            'Receive an itemised monthly statement and settle by BACS, direct debit or card.',
        },
      ],
    },
    faqs: [
      {
        question: 'Who can apply for a trade credit account?',
        answer:
          'Sole traders, partnerships and limited companies actively working in construction, development or property maintenance can apply.',
      },
      {
        question: 'Do you carry out a credit check?',
        answer:
          'Yes. We run a standard credit and trade-reference check as part of the application. This helps us set a fair credit limit.',
      },
      {
        question: 'How long does approval take?',
        answer:
          'Most applications are approved within one working day once we have all the required information and references.',
      },
      {
        question: 'What credit limit can I get?',
        answer:
          'Credit limits are tailored to your turnover, trading history and references. Limits can be reviewed and increased as your account history grows.',
      },
      {
        question: 'How do I pay my monthly statement?',
        answer:
          'We accept BACS transfer, direct debit and card payments. Statements are sent monthly with 30-day terms.',
      },
    ],
    cta: { label: 'Apply for credit', href: '/quote' },
  },
]

export function getServiceBySlug(slug: string): ServicePage | undefined {
  return SERVICES.find((s) => s.slug === slug)
}

export function listServiceSlugs(): string[] {
  return SERVICES.map((s) => s.slug)
}
