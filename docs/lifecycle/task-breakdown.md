# Task Breakdown - Demo Builder Merchant

- **Status:** ACTIVE
- **Updated:** 2026-08-04
- **Source understanding:** docs/lifecycle/understanding.md (CONFIRMED)

## Completeness check
- [x] Every P0 requirement maps to at least one task
- [x] Feature ids match project-state (`F-…`)
- [x] Medium+ forks have D-ids locked (`decisions.md`)
- [x] Scaffold not required (brownfield); seed scripts = ops scaffold
- [x] Test panel rows for non-trivial UI features
- [x] No mega-task

## Epic / feature index

| ID | State id | Name | Priority | Depends on | Phase | Status |
|----|----------|------|----------|------------|-------|--------|
| E1 | F-demo-brand | Demo branding | P0 | - | A | pending |
| E2 | F-demo-seed | Clients + multi-year invoice seed | P0 | E1 (admin user exists) | A | pending |
| E3 | F-demo-runbook | Wipe/reseed runbook + env docs | P0 | E2 | A | pending |
| E4 | F-vertical-packs | Industry vertical content packs | P0 | E1 | B | pending |
| E5 | F-vertical-skus | Sample SKUs non-construction | P1 | E4 | B | pending |
| E6 | F-demo-banner | DEMO banner | P1 | later | C | deferred |

## Feature E1 - F-demo-brand

### Goal
Present as Demo Builder Merchant when demo mode is on; company_settings seedable; critical chrome/SEO not stuck on Star Hawk in demo.

### Out of scope
Full content MD rewrite; package rename mandatory.

### Chunks

| ID | Chunk goal | Depends on | Likely files | Acceptance | Agent | Status |
|----|------------|------------|--------------|------------|-------|--------|
| E1-C1 | Demo brand helper + env (`DEMO_MODE`, site name) | - | `lib/demo/brand.ts` or extend seo/company helpers; `.env.example` | Helper returns Demo Builder Merchant when demo on; Star Hawk when off | [impl] | pending |
| E1-C2 | Wire chrome/SEO/manifest/auth titles to helper + company loaders | E1-C1 | `app/layout.tsx`, `lib/seo/*`, `manifest.ts`, auth pages, BrandLogo/DashboardBrand | Grep primary demo surfaces: no Star Hawk when DEMO_MODE=true | [impl] | pending |
| E1-C3 | Seed/update company_settings for demo name (script or seed step) | E1-C1 | seed script / SQL | After seed, `company_name` = Demo Builder Merchant | [impl] | pending |
| E1-T1 | Brand smoke panel | E1-C* | docs/test-runs/demo-brand | Homepage title/header demo brand; non-demo fallback documented | [wf]/[connect] | pending |

### Decisions
- D-003

## Feature E2 - F-demo-seed

### Goal
~100 clients, ~30 months invoices/quotes/items/payments with realistic cadence and line counts.

### Out of scope
Wallet-heavy ledger; full quote_request marketing spam; stock routing battles (keep off).

### Chunks

| ID | Chunk goal | Depends on | Likely files | Acceptance | Agent | Status |
|----|------------|------------|--------------|------------|-------|--------|
| E2-C1 | Seed framework: env load, confirm guard, resolve admin user, CLI flags | - | `scripts/seed-demo-history.mjs` | Refuses without `DEMO_SEED_CONFIRM=yes`; `--clients`/`--months` work | [impl] | pending |
| E2-C2 | Generate clients (UK names, trades, accounts, addresses) | E2-C1 | same + data helpers | 100 clients insert; unique account numbers | [impl] | pending |
| E2-C3 | Generate documents + items + payments (tiers, VAT, historical numbers) | E2-C2 | same; reuse wipe/VAT patterns | Counts match volume; statuses mix; paid/partial via payments; issue_date span months | [impl] | pending |
| E2-C4 | Sync document_sequences / order sequences after seed | E2-C3 | same | Future live docs do not collide with seeded numbers | [impl] | pending |
| E2-T1 | Seed verify panel | E2-C* | SQL counts + dashboard smoke | Report: client count, invoice count, date min/max, status histogram | [connect]/[wf] | pending |

### Decisions
- D-002, D-004

## Feature E3 - F-demo-runbook

### Goal
Documented path: env, wipe, seed, login, demo script.

### Chunks

| ID | Chunk goal | Depends on | Likely files | Acceptance | Agent | Status |
|----|------------|------------|--------------|------------|-------|--------|
| E3-C1 | Write `docs/demo/RUNBOOK.md` + package.json scripts | E2-C1 | `docs/demo/RUNBOOK.md`, `package.json`, `.env.example` | Runbook complete enough for operator without chat | [impl] | pending |
| E3-T1 | Runbook review | E3-C1 | - | Commands listed match real scripts | Manager | pending |

## Feature E4 - F-vertical-packs

### Goal
Switchable packs: construction, plumbing, electrical, windows, tile driving landing hero/FAQ framing/category emphasis.

### Chunks

| ID | Chunk goal | Depends on | Likely files | Acceptance | Agent | Status |
|----|------------|------------|--------------|------------|-------|--------|
| E4-C1 | Vertical pack types + 5 pack manifests (copy) | E1-C1 | `lib/demo/verticals/*.ts` | All 5 ids export valid pack shape | [impl] | pending |
| E4-C2 | Wire landing (Hero, FAQ, services framing, category filter) to active pack | E4-C1 | `app/page.tsx`, `components/landing/*`, resolver from env/settings | Changing `DEMO_VERTICAL` changes hero H1/body without rebuild of other verticals | [impl] | pending |
| E4-C3 | Document vertical switch in runbook | E4-C2, E3-C1 | RUNBOOK | Operator can switch vertical in <2 min | [impl] | pending |
| E4-T1 | Vertical UI panel | E4-C* | shots optional | At least 2 verticals show distinct landing copy | [wf]/[ui-vis] | pending |

### Decisions
- D-001

## Feature E5 - F-vertical-skus (P1)

### Goal
Sample products for non-construction packs so catalogue is not empty.

### Chunks

| ID | Chunk goal | Depends on | Likely files | Acceptance | Agent | Status |
|----|------------|------------|--------------|------------|-------|--------|
| E5-C1 | Product seed per vertical (30–80 SKUs, categories, prices) | E4-C1 | `scripts/seed-demo-vertical-products.mjs` | Products exist with correct category strings | [impl] | pending |
| E5-C2 | Category meta + images (reuse/placeholder) for new categories | E5-C1 | `category-meta.ts`, `public/categories/` | Landing grid shows pack categories when active | [impl] | pending |
| E5-T1 | Catalogue smoke per vertical | E5-C* | - | `/catalogue` returns products for active vertical filter strategy | [wf] | pending |

### Decisions
- D-005

## Dependency graph

```text
E1-brand ──┬──> E2-seed ──> E3-runbook
           │
           └──> E4-packs ──> E5-skus
```

Phase A: E1 → E2 → E3  
Phase B: E4 → E5  
Phase C (later): E6 banner

## Manager task understanding
- P0 path is A then B packs (B can start after E1 without waiting for full seed if needed, but seed is higher demo value first).
- Prefer Phase A complete before deep vertical SKUs.
- File ownership: brand files vs seed scripts vs vertical packs rarely conflict; sequential [impl] still default.
