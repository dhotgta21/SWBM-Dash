# TRACKING: Demo Builder Merchant campaign

## Intent
Package SWBM as client-ready **Demo Builder Merchant**: branding, multi-trade vertical packs, dense SQL seed (~100 clients, ~2.5 years history).

## Active execution plan
- None (completed: `docs/plans/demo-builder-merchant-2026-08-04.md` – file removed at plan complete)
- Status: **COMPLETED** 2026-08-04

## Features

| ID | Phase | Status | Evidence |
|----|-------|--------|----------|
| F-demo-brand | A | done | `lib/demo/brand.ts`, layout/SEO/wordmarks; vitest 2/2; tsc 0 |
| F-demo-seed | A | done | `scripts/seed-demo-history.mjs` + confirm guard + flags |
| F-demo-runbook | A | done | `docs/demo/RUNBOOK.md` + npm scripts |
| F-vertical-packs | B | done | `lib/demo/verticals/*`, Hero/FAQ/category order on homepage |
| F-vertical-skus | B | done | `scripts/seed-demo-vertical-products.mjs` + category-meta + image placeholders |
| F-demo-banner | C | later | out of this plan |

## Verification
- `npx tsc --noEmit` → exit 0
- `npx vitest run lib/demo/brand.test.ts` → 2 passed
- Live Postgres seed **not run** in this environment (no `.env.local`); operator runs per RUNBOOK

## Residual
1. Operator must seed a **dedicated demo** Supabase with `DEMO_SEED_CONFIRM=yes`.
2. Some marketing MD/content may still mention Star Hawk (P2).
3. Category images for new verticals are placeholders (copied tools.webp).
4. Optional DEMO banner (F-demo-banner) not built.

## Incident: products empty + sign-in CAPTCHA (2026-08-04)
| Item | Detail |
|------|--------|
| **Products root cause** | Partial schema missing `products.deleted_at` / `is_temporary`; admin queries filter those columns → empty UI. Anon RLS may also block public reads. |
| **Products fix** | `schema.sql` columns + RLS; seed `00b_fix_products_columns_and_rls.sql`; resilient admin list; public list fallback |
| **Auth root cause** | Demo skips Turnstile, but Supabase Attack Protection CAPTCHA still blocks password grant; empty `{}` over-reported as CAPTCHA |
| **Auth fix** | Clearer errors; demo password verify via Postgres + generateLink session mint; register path session mint |
| **Proof** | `npx tsc --noEmit` exit 0; vitest brand + public-products 10/10 |
| **Operator** | Run `00b` + `02` SQL; CAPTCHA OFF; redeploy |

## Incident: Analytics blank + product detail 404 (2026-08-04)
| Item | Detail |
|------|--------|
| **Symptoms** | Dashboard: "Unable to load dashboard data"; `/quote/bricks` lists products; `/products/ENG-CLAS` title "Product not found" |
| **Dashboard root cause** | Live DB missing `invoices.deleted_at` and `payments.deleted_at` (migration 093 not applied). `getDashboardMetrics` and money-collection filtered those columns → query throw → error alert |
| **Product detail root cause** | Live DB missing `products.materials` / `variant_options` / `family_slug` / `source_url`. `listPublicProducts` fell through column sets; `getPublicProductByCode` did not → null → not found |
| **App fix** | Resilient column-set walk in `getPublicProductByCode` + CORE set; soft-delete filter retry in `lib/dashboard.ts` and `lib/money-collection.ts` |
| **Schema fix (optional permanent)** | `supabase/seed/00e_fix_dashboard_deleted_at_and_product_variants.sql` |
| **Proof** | Live Supabase repro of both errors; resilient shapes return data; `npx tsc --noEmit` exit 0; vitest public-products + money-collection 12/12 |
| **Operator** | Deploy this commit to Vercel. Optionally run `00e` SQL once for full schema parity |

## Decisions
See `docs/lifecycle/decisions.md` D-001–D-005.
