// lib/testimonials/data.ts
// Customer testimonials and reviews. REPLACE THE EXAMPLES BELOW with real
// reviews from Google Business Profile, Trustpilot, email feedback or site
// quotes. The aggregate rating feeds structured data on the home page.

export interface Testimonial {
  /** Reviewer's full name or initials. */
  readonly name: string
  /** Short role/context, e.g. "Self-builder, Wokingham". */
  readonly role: string
  /** Star rating 1-5. */
  readonly rating: number
  /** Review text. */
  readonly text: string
  /** Optional date in ISO format. */
  readonly date?: string
}

export interface TestimonialStats {
  readonly averageRating: number
  readonly totalReviews: number
}

// TODO: Replace these example testimonials with real customer reviews.
// Empty the array if you do not have permission to publish reviews yet.
export const TESTIMONIALS: Testimonial[] = [
  {
    name: 'James T.',
    role: 'Site manager, Bracknell',
    rating: 5,
    text: 'Same-day delivery saved us twice this month. The trade counter knows their stock and the pricing is sharp.',
    date: '2026-05-14',
  },
  {
    name: 'Sarah M.',
    role: 'Self-builder, Oxford',
    rating: 5,
    text: 'Helpful advice on mortar mixes and exactly the bricks we needed. Delivery was on time and the driver was brilliant.',
    date: '2026-04-22',
  },
  {
    name: 'MK Developments',
    role: 'Commercial client, Slough',
    rating: 4,
    text: 'Reliable bulk aggregate supply and clear invoicing. Our go-to merchant for the M4 corridor.',
    date: '2026-03-08',
  },
  {
    name: 'Dave R.',
    role: 'Bricklayer, Reading',
    rating: 5,
    text: 'Been using Star Hawk for six months. Bricks are always clean, well-stacked and the load sizes are spot on.',
    date: '2026-05-28',
  },
  {
    name: 'Priya K.',
    role: 'Project manager, Guildford',
    rating: 5,
    text: 'Timber order arrived cut to length and on the dot. Saved my carpenters half a day on site. Highly recommended.',
    date: '2026-05-02',
  },
  {
    name: 'Tom & Sons Builders',
    role: 'High Wycombe',
    rating: 4,
    text: 'Good prices on ballast and Type 1. Easy to ring through a repeat order and they remember the delivery notes.',
    date: '2026-04-10',
  },
  {
    name: 'Lisa H.',
    role: 'Renovation client, Hayes',
    rating: 5,
    text: 'I had no idea what I needed for a small extension. They talked me through the materials and the quote came back the same day.',
    date: '2026-03-25',
  },
]

export function getTestimonialStats(): TestimonialStats {
  if (TESTIMONIALS.length === 0) return { averageRating: 0, totalReviews: 0 }
  const total = TESTIMONIALS.reduce((sum, t) => sum + t.rating, 0)
  return {
    averageRating: Math.round((total / TESTIMONIALS.length) * 10) / 10,
    totalReviews: TESTIMONIALS.length,
  }
}
