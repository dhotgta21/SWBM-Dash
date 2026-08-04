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

## Incident: dense demo seed (2026-08-04)
| Item | Detail |
|------|--------|
| **Goal** | ≥250 products, multi-year clients/invoices for Analytics seasonality demos |
| **Products** | `seed-demo-catalog.mjs` → **356** active SKUs / 42 categories |
| **History** | wipe + `seed-demo-history.mjs --clients 100 --months 48` → **4184** invoices, **3666** payments, span 2022-08 → 2026-08 |
| **Tenure** | mixed 12/24/36/48m buckets (25/35/25/15 clients) |
| **Seasonality** | monthly sales peak/trough ratio ~170; spring peaks in generator |
| **Portal** | 100 client portal accounts, password `DemoClient1!` |
| **Schema** | applied `00e` + `00a` on live |
| **Proof** | status/tenure verify scripts; live `/products/ENG-CLAS` title OK |

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

## Incident: Clients zero + Unknown client + PDF not found + discounts zero (2026-08-04)
| Item | Detail |
|------|--------|
| **Clients symptom** | Admin Clients: 0 accounts; Client Dashboard empty; Top debtors "Unknown client". Portal still showed invoices. |
| **Clients root cause** | Live DB missing `clients.deleted_at`, `is_temporary`, `promoted_at`, `account_balance`. Admin queries hard-filter those columns; count errors collapsed to 0. Name lookup filtered `deleted_at` and returned no rows. |
| **PDF symptom** | Invoice list/detail line items OK; Preview / Print / Download returned "Invoice not found". |
| **PDF root cause** | `/api/invoices/pdf` full select required `discount_amount` / `discount_percent` (migration 101) missing on live invoices + invoice_items. Select error mapped to 404. Also authz denials returned the same 404 string. |
| **Discounts symptom** | Campaign groups Live now > 0; Product discounts hero showed 0. |
| **Discounts root cause** | Two systems: campaign groups vs per-product `sale_price`. Seed had 0 individual sales and 120 campaign products; dashboard only counted `sale_price`. |
| **Schema fix** | `supabase/seed/00f_fix_clients_columns.sql` + `scripts/apply-00f-clients.mjs` applied on live demo DB. Permanent clients now 100. |
| **App fix** | Resilient clients list/detail/dashboard; money-collection name lookup retry; PDF lean select + prefer invoiceId + 403 for authz; `loadSeasonalSalesProducts` merges live campaign products. |
| **Proof** | Live SQL verify permanent=100, PDF cols present, Summer Trade Sale 40 products; `npx tsc --noEmit` exit 0; vitest money-collection + discount 48/48 |
| **Operator** | Deploy app. If another env still broken: run `00f` SQL (or `node scripts/apply-00f-clients.mjs` with Postgres URL). |

## Decisions
See `docs/lifecycle/decisions.md` D-001–D-005.
