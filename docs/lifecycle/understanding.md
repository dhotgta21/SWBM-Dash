# Understanding - Demo Builder Merchant

- **Status:** CONFIRMED
- **Confirmed by user:** 2026-08-04 (approve)
- **Updated:** 2026-08-04

## In one paragraph

We are turning the existing polished Star Hawk builders-merchant web app into a **client-ready demo product** named **Demo Builder Merchant**. The demo keeps the same full stack (marketing site, shop, staff dashboard, invoices, portal). We fill it with synthetic but realistic UK trade clients (~100) and about 2.5 years of invoices, line items, and payments so every screen looks busy and professional. We also add **industry vertical packs** (construction default, plus plumbing, electrical, windows, tile) so you can change landing-page story and product emphasis for different prospects, proving the platform is a general trade-merchant dashboard, not only one brand.

## How it works (product story)

1. You deploy (or point) a **dedicated demo** Supabase + Vercel environment (not production customer data).
2. You run **wipe + seed**: creates ~100 trade clients and multi-year document history with weekly/fortnightly patterns, 2–15 lines per invoice, mixed statuses and payments.
3. Company settings and code fallbacks present **Demo Builder Merchant** branding; logo/colors still adjustable in Brand settings.
4. Optional: set `DEMO_VERTICAL` (or settings equivalent) to `construction` | `plumbing` | `electrical` | `windows` | `tile` so the homepage hero, FAQ framing, and category emphasis match the prospect.
5. In the meeting you walk: landing → catalogue/quote → login → dashboard charts → client history → open invoice / PDF → optional portal.
6. Before the next meeting you re-seed for a clean slate.

## Roles & journeys (summary)

- **Presenter:** Set vertical (if needed) → open site → show shop → staff dashboard → drill into a hot client → create or open invoice → show PDF/share.
- **Prospect:** Sees their industry language on the landing page, then sees operational depth (history, payments, products).
- **Demo admin (seeded):** Day-to-day staff workflows already built; we only need credentials and data.

## Research backbone

- Reference pattern: switchable **content packs** for demos, not multi-tenant SaaS.
- P0: brand + dense history + construction vertical + reseed runbook.
- P1: non-construction sample products + vertical switch.
- Explicitly not cloning: multi-org tenancy, full wholesale catalogs per trade.

## Shape of the system

- **Unchanged core:** Next.js + Supabase single-tenant schema, server actions, RLS, invoice engine.
- **New/ops layer:**
  - `scripts/seed-demo-*.mjs` (and related SQL) for bulk history
  - Vertical pack config (TS modules or JSON) consumed by landing + optional product seed
  - Demo env documentation (`.env.example` keys, runbook)
- **Light product code changes:** brand fallbacks, landing content source, optional demo banner, vertical flag.

Why this fits: the app is already complete; the gap is **demo identity**, **dense data**, and **vertical storytelling**.

## What "good" looks like

- **UX:** Full lists and charts; no empty-state shame during a sales visit. Landing feels relevant to the prospect's trade within one env switch.
- **Technical quality:** Seed is deterministic-ish, documented, safe only on demo DB; no schema multi-tenant rewrite; architecture reuses wipe script patterns and VAT math.
- **Demo script (happy path):**
  1. Homepage (vertical-specific hero)
  2. Catalogue category browse
  3. Admin login
  4. Dashboard year-over-year / top clients
  5. Client detail with order history
  6. Invoice with 8–12 lines + payment trail + PDF
  7. (Optional) Portal view for one client

## What I might have wrong (check with user)

1. Brand string: **Demo Builder Merchant** is the default; you may prefer something shorter.
2. Vertical depth: I propose **packs + sample SKUs**, not five complete industry catalogs.
3. One deploy with a switcher, not five separate demos (unless you want separate deploys).
4. Production Star Hawk defaults stay when demo env is unset (safer for this repo).
5. Blog/case studies may still mention Star Hawk unless we hide them (P2).
6. Exact seed volume: 100 clients / 30 months is a planning default.

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Seed volume slow or times out | Demo DB half-filled | Batch inserts; tiered volumes; progress logs |
| Historical document numbers collide | Seed fails | Unique per month letter + sequence update |
| Wrong DB wiped | Data loss | Hard guard: require `DEMO_SEED_CONFIRM=yes` + refuse known production URL patterns if configured |
| Vertical packs half-empty | Weak story | Ship construction fully; P1 sample SKUs for others |
| Multi-tenant overbuild | Delayed demo | Locked out of scope |

## Mapping to requirements

| Requirement ID | Covered? | Notes |
|----------------|----------|-------|
| R1 Demo brand | yes | |
| R2 100 clients | yes | |
| R3 multi-year history | yes | |
| R4 showcase density | yes | |
| R5 wipe+reseed | yes | |
| R6 construction default | yes | |
| R7 vertical storytelling | yes | packs |
| R8 runbook | yes | |
| R9–R12 P1 | yes | after P0 |
| R13–R16 P2 | noted | later |

## Recommended decisions (for you to confirm)

| Decision | Recommendation |
|----------|----------------|
| Brand name | **Demo Builder Merchant** |
| Vertical architecture | **Switchable content packs** in one demo deploy |
| Non-construction catalogs | **Sample SKUs** (not full catalogs) in P1 |
| Data volume | **100 clients**, **~30 months**, activity tiers |
| Production safety | Seed/wipe **demo DB only**; confirm env flag |
| Scope of code rename | Demo-aware fallbacks + seed; keep Star Hawk when not in demo mode |
