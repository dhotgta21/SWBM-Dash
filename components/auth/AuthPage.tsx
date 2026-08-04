// components/auth/AuthPage.tsx
// Server wrapper that loads company data and renders the AuthShell with
// the correct per-page brand-panel image.
//
// Why a server wrapper instead of letting each page compose the
// AuthShell directly?
//
//   1. The four auth pages (login, admin-login, reset-password,
//      update-password) all need exactly the same outer chrome
//      (AuthShell) plus the same company data (phone, name). One
//      server component reads the data once and threads the
//      per-page image through — every page just supplies an
//      `image` key and a form.
//
//   2. Keeping the data load here (rather than in the shared
//      layout) means the layout can stay a thin pass-through,
//      which in turn lets Next.js render the four pages with
//      distinct static images at the route segment level.
//
//   3. The per-page image map lives next to the component that
//      consumes it, so a new auth surface is one entry away.
//
// Failure mode: if loadCompany() throws (dev / build with no
// admin client), the wrapper falls back to a neutral phone and
// company name and logs a warning. The auth surface is on the
// critical path for first-run setup, so we never want it
// blocked by a loadCompany() error.
//
// Image rotation on the login + register pages:
//
//   The login surface rotates through a curated pool of 13
//   cinematic construction photos on every request. We pick
//   server-side with `Math.random()` so the HTML response
//   already contains the chosen image (no client-side flash, no
//   hydration mismatch) and every refresh — and every new tab —
//   surfaces a different shot. The other auth pages (admin,
//   reset, update) keep their single specific image — those
//   flows are short and the same shot every time is fine.
//
//   The same pool is also the source for the landing-page hero
//   slideshow (see HERO_SLIDES below) so the marketing site and
//   the auth surfaces share the same curated visual language.

import { loadCompany, getChannelForContext } from '@/lib/company'
import { AuthShell } from '@/components/auth/AuthShell'

const FALLBACK_PHONE = '01234 567 890'
const FALLBACK_NAME = 'Star Hawk Builders Merchant'

/** Per-page brand-panel image. Add a new key here when introducing
 *  a new auth surface. The 'login' and 'register' keys rotate
 *  through the curated pool on every request. */
export type AuthPageKey = 'login' | 'admin' | 'reset' | 'update' | 'register'

export interface AuthImageEntry {
  src: string
  alt: string
}

/**
 * Login / register rotation pool — 13 cinematic construction photos
 * that share the golden-hour aesthetic of the locations-page imagery.
 * All shot at 21:9 anamorphic 4K so the brand panel reads as a single
 * curated set rather than thirteen disjoint images.
 *
 * The pool deliberately skews to WIDE scenic shots (yard exteriors,
 * warehouses, timber rows, building sites, heavy equipment) — close-up
 * still-life shots (a single brick, a trowel, macro fixings) were
 * tried and rejected: they read as a product photo, not a brand
 * statement, and they fight with the dark text overlay on the panel.
 *
 * Adding a new image:
 *   1. Generate at 21:9 / 4K via matrix_generate_image.
 *   2. Convert to WebP at quality 82 and drop into /public/ with the
 *      next `auth-login-cinematic-NN.webp` filename.
 *   3. Append the {src, alt} entry below. The same file can also be
 *      added to HERO_SLIDES if you want it on the landing page too.
 */
const LOGIN_POOL: AuthImageEntry[] = [
  {
    src: '/auth-login-cinematic.webp',
    alt: 'Builders merchant yard exterior at golden hour with stacked timber and brick pallets',
  },
  {
    src: '/auth-login-cinematic-05.webp',
    alt: 'Tall stacks of fresh pine timber at a builders merchant yard in early morning mist',
  },
  {
    src: '/auth-login-cinematic-06.webp',
    alt: 'Red brick pallets stacked in a builders merchant yard at golden hour with low warm sunlight',
  },
  {
    src: '/auth-login-cinematic-07.webp',
    alt: 'Lone construction worker silhouette standing on a steel beam at golden hour',
  },
  {
    src: '/auth-login-cinematic-08.webp',
    alt: 'Forklift loading pallets of red bricks onto a flatbed lorry at a builders merchant yard',
  },
  {
    src: '/auth-login-cinematic-09.webp',
    alt: 'Large aggregate piles of gravel and crushed stone catching warm amber light at golden hour',
  },
  {
    src: '/auth-login-cinematic-10.webp',
    alt: 'Tower crane silhouetted against a dramatic golden hour cloud-filled sky',
  },
  {
    src: '/auth-login-cinematic-11.webp',
    alt: 'Half-built residential house with scaffolding and brick walls in progress at golden hour',
  },
  {
    src: '/auth-login-cinematic-12.webp',
    alt: 'Long warehouse aisle with tall industrial racking stacked with cement bags, golden sunbeams through windows',
  },
  {
    src: '/auth-login-cinematic-13.webp',
    alt: 'Long parallel rows of stacked pine and cedar planks in a timber yard at golden hour',
  },
  {
    src: '/auth-admin-login-cinematic.webp',
    alt: 'Modern builders merchant warehouse interior with golden sunlight streaming through tall industrial windows',
  },
  {
    src: '/auth-reset-password-cinematic.webp',
    alt: 'Heavy excavator working on a freshly cleared building site at golden hour, dust rising from the bucket',
  },
  {
    src: '/auth-update-password-cinematic.webp',
    alt: 'High-rise construction site at sunrise with a tower crane silhouetted against a glowing sky',
  },
]

/**
 * Stable single-image entries for the auth surfaces that don't
 * rotate (shorter flows, the same shot every time is fine).
 */
const AUTH_IMAGES: Record<Exclude<AuthPageKey, 'login' | 'register'>, AuthImageEntry> = {
  admin: {
    src: '/auth-admin-login-cinematic.webp',
    alt: 'Modern builders merchant warehouse interior with golden sunlight streaming through tall industrial windows',
  },
  // Themed to fit a "password reset / fresh start" flow: heavy
  // equipment breaking ground at dawn reads as a clean slate.
  reset: {
    src: '/auth-reset-password-cinematic.webp',
    alt: 'Heavy excavator working on a freshly cleared building site at golden hour, dust rising from the bucket',
  },
  update: {
    src: '/auth-update-password-cinematic.webp',
    alt: 'High-rise construction site at sunrise with a tower crane silhouetted against a glowing sky',
  },
}

/**
 * Landing-page hero slideshow. A curated 6-image subset of the same
 * pool, hand-picked to open with the most cinematic wide scenic
 * shots so the marketing hero feels like the same curated set as
 * the auth pages.
 *
 * The order matters — Hero.tsx crossfades through them in this
 * order on a 7-8s loop. Anything that reads as "still life" (single
 * brick, trowel, macro fixings) was deliberately left out; only
 * wide golden-hour construction scenes live here.
 */
export const HERO_SLIDES: ReadonlyArray<AuthImageEntry> = [
  LOGIN_POOL[0]!,  // yard exterior at golden hour
  LOGIN_POOL[5]!,  // aggregate piles
  LOGIN_POOL[8]!,  // half-built house
  LOGIN_POOL[9]!,  // warehouse aisle sunbeams
  LOGIN_POOL[7]!,  // forklift loading bricks
  LOGIN_POOL[10]!, // timber yard rows
]

/** Pick a random image from a pool. Used at request time. */
function pickFromPool(pool: AuthImageEntry[]): AuthImageEntry {
  // Server-side random. Each request gets a fresh pick; the HTML
  // response embeds the chosen src so there's no client-side
  // flash or hydration mismatch. With 13 images the chance of a
  // consecutive duplicate is ~7.7%, which gives "feels alive"
  // without ever feeling like the page is broken.
  const idx = Math.floor(Math.random() * pool.length)
  return pool[idx]
}

interface AuthPageProps {
  /** Selects the brand-panel image. The map is the single source
   *  of truth for which image each auth page shows. The
   *  'login' and 'register' keys rotate through the curated
   *  pool on every request. */
  image: AuthPageKey
  children: React.ReactNode
}

export async function AuthPage({ image, children }: AuthPageProps) {
  let phone = FALLBACK_PHONE
  let name = FALLBACK_NAME
  try {
    const company = await loadCompany()
    const authPhone = getChannelForContext(company.phones, 'auth')?.value
    phone = authPhone?.trim() || FALLBACK_PHONE
    name = company.name
  } catch (err) {
    // Dev / build environments may lack admin credentials. The
    // shell has its own fallbacks so the page still renders.
    console.warn('[auth] Could not load company_settings, using fallback:', err)
  }

  const entry: AuthImageEntry =
    image === 'login' || image === 'register'
      ? pickFromPool(LOGIN_POOL)
      : AUTH_IMAGES[image]

  return (
    <AuthShell
      phone={phone}
      companyName={name}
      image={entry.src}
      imageAlt={entry.alt}
    >
      {children}
    </AuthShell>
  )
}
