# Codebase Report - SWBM Demo Campaign

- **Status:** CURRENT
- **Scanned:** 2026-08-04
- **Scope:** full app, focused on branding, landing, products, clients/invoices seed paths
- **Scanner:** Manager + [explore] agents (schema map, branding/landing map)

## 1. Snapshot

- **Platform:** Web (Next.js App Router on Vercel)
- **Stack:** Next.js 16, React 19, Supabase (Postgres + Auth + RLS), Tailwind 4, TanStack Query, Recharts, @react-pdf/renderer, Vitest
- **Package manager:** npm (`package-lock.json`); package name `starhawk-dashboard`
- **Runnable:** yes via `npm run dev` after `.env.local` + Supabase schema
- **Scripts:** `dev`, `build`, `start`, `lint`, `typecheck`, `test`, `seed` (DPC products only), `migrate`

## 2. Tree map (high level)

| Area | Path | Role |
|------|------|------|
| Marketing site | `app/page.tsx`, `app/about`, `blog`, `guides`, `case-studies`, `locations`, `tools` | Public SEO landing |
| Public shop | `app/(public-shop)/` | Catalogue, products, quote, cart |
| Staff dashboard | `app/(dashboard)/` | Clients, invoices, products, settings, campaigns |
| Client portal | `app/(portal)/` | Trade account portal |
| Picker / driver | `app/(picker)/`, `app/(driver)/` | Warehouse / delivery ops |
| Server actions | `lib/actions/*` | CRUD, auth, payments |
| Domain libs | `lib/*.ts` | VAT, invoices, products, company, appearance |
| Content MD | `content/blog`, `guides`, `case-studies` | Editorial (Star Hawk branded) |
| DB | `supabase/schema.sql`, `migrations/` | Full schema + product seeds |
| Ops scripts | `scripts/` | Wipe clients/invoices, product import, image gen |

## 3. Routes / screens (demo-relevant)

| Route | Notes |
|-------|-------|
| `/` | Landing: hero, categories, services, FAQ, contact |
| `/catalogue`, `/products`, `/quote`, `/cart` | Public commerce |
| `/admin-login` | Staff login (path overridable by env) |
| `/dashboard` | KPI + charts (needs real invoice history to shine) |
| `/clients`, `/invoices` | Core CRM + billing |
| `/settings/company`, `/settings/brand` | Name, logo, theme colors |
| `/portal/*` | Client-facing history |

## 4. Architecture

- **Layers:** Next.js RSC pages → server actions (`lib/actions`) → Supabase client/admin → Postgres RLS
- **Single-tenant:** `company_settings` is one row (`id = 1`). No multi-merchant tenancy.
- **Branding:** Runtime name/logo/theme mostly from DB + CSS vars (`lib/appearance.ts`). Many SEO/marketing fallbacks still hardcode "Star Hawk Builders Merchant".
- **Auth:** Supabase email/password; first admin via sealed `/register`; roles admin/staff/client/picker/driver.
- **External:** Resend email, GoAddress postcode, Turnstile, optional GA.

## 5. Feature / module status

| Module | Class | Notes for demo |
|--------|-------|----------------|
| Staff dashboard + invoices | live | Needs dense realistic history for client demos |
| Clients CRM | live | No bulk demo seeder today |
| Product catalog | live | Construction-focused (~100s products + images) |
| Public shop / quote | live | Works with construction categories |
| Brand settings (name/logo/colors) | live | Enough for light rebrand via UI |
| Landing copy / hero | live | Hardcoded construction positioning |
| Multi-vertical packs | **missing** | Plumbing / electrical / windows / tile not present |
| Client+invoice history seed | **missing** | Wipe script exists; no generate script |
| Demo deploy profile | partial | Vercel-ready app; no demo env pack / seed pipeline |

## 6. Design system

- Tailwind + CSS variables from appearance settings (primary default red `#b91c1c`)
- UI under `components/ui/`
- Logo dimensions in `lib/brand.ts`; assets in `public/Logo.*`

## 7. Conventions (sacred for new work)

- Server actions in `lib/actions/*`; types in `lib/database.types.ts`
- Prefer existing wipe-script pattern (`pg` + `POSTGRES_URL_NON_POOLING`) for bulk data
- Invoice status machine in `lib/invoice-status.ts`: draft → sent → partial → paid
- Document numbers: `PREFIX-YYYY-MONTHLETTERSEQ` (e.g. `INV-2024-C12`); historical seed must invent numbers (RPC always uses `now()`)
- `created_by` on clients/invoices/payments must be a real `auth.users` id
- Prefer payments insert + trigger over hand-setting `amount_paid` only
- No em dash in project docs under this skill
- Do not invent multi-tenant schema unless decided; single-tenant is the product shape

## 8. Test & quality

- Vitest for selected libs; Playwright available for screenshots
- `npx tsc --noEmit` is the main type gate
- No existing test covering bulk seed

## 9. Risks & debt

| Risk | Severity | Suggested action |
|------|----------|------------------|
| Hardcoded Star Hawk strings in SEO/content | medium | Centralize fallbacks + env/demo company seed |
| Historical document numbers cannot use RPC | high for seeder | Manual unique numbers + sequence sync |
| Stock routing can break seed if enabled | medium | Keep off or seed high stock |
| Full multi-tenant is huge | high if chosen | Prefer vertical content packs + seed, not tenancy |
| Editorial MD still Star Hawk | low for demo | Hide nav sections or leave with disclaimer |
| Volume (100 clients × years) | medium | Batch SQL transactions; measure insert time |

## 10. For the current ask

**User ask:** Deploy a polished **demo** of this product as "Demo Builder Merchant" (or similar), show it works for any trade merchant (construction, plumbing, electrical, windows, tile) via landing/catalog variants, and fill SQL with ~100 clients + 2–3 years realistic trading history (weekly-ish orders, 2–15 lines, realistic invoices).

**Reuse:**

- Existing construction catalog + images for construction vertical
- Brand settings (company name, logo, theme)
- Wipe script as re-seed foundation
- Dashboard/invoice/client UI (already complete)
- Landing section components (wire to content packs)

**Avoid:**

- Multi-tenant RLS rewrite for a sales demo
- Rewriting all blog/case studies unless needed
- Seeding via UI server actions (captcha, payment password, year-locked RPC)

**Suggested first chunks (after plan approval):**

1. Demo brand config (env + fallbacks + company_settings seed values)
2. Demo seed script: clients + multi-year invoices/items/payments
3. Vertical pack model (landing + categories + sample products) starting with construction + 1–2 extras
4. Demo runbook (how to wipe/reseed/deploy for client visits)

**Arch-fit constraints:**

- Single-tenant; packs are content/config, not new tenancy
- Seed scripts live under `scripts/` next to wipe
- Landing still uses existing components; only content source changes
- Product categories remain free-text on `products.category`
