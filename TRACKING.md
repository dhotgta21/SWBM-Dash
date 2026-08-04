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

## Decisions
See `docs/lifecycle/decisions.md` D-001–D-005.
