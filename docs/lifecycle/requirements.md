# Requirements - Demo Builder Merchant

- **Status:** CONFIRMED
- **Updated:** 2026-08-04
- **Source:** user message (demo deploy + multi-trade showcase + SQL history) / codebase constraints (inferred labeled)

## 1. Problem

The product is a polished builders-merchant dashboard and public shop (Star Hawk Builders Merchant branding). For client sales visits, the owner needs a **deployable demo** that:

1. Reads as a **generic product demo** (not only one production brand).
2. Shows that the same platform works for **any trade merchant** (construction, plumbing, electrical, windows, tile, etc.).
3. Looks **alive**: ~100 clients and 2–3 years of realistic trading history so dashboards, invoices, and CRM are full and believable.

## 2. Goals

- **Primary:** One consistent demo environment that showcases the full product (marketing → shop → CRM → invoices → payments → portal) with dense, realistic data.
- **Secondary:** Ability to present different industry flavours (landing + product mix) so a prospect in plumbing or windows can "see themselves".
- **Secondary:** Clear rebrand for demo: **Demo Builder Merchant** (or agreed short name).
- **Tertiary:** Repeatable wipe + reseed so demos can be reset before a client meeting.

## 3. Non-goals / out of scope

- True multi-tenant SaaS (many real merchants on one DB) unless later approved.
- Full rewrite of all blog / case-study / guide markdown for every vertical (P2 at most).
- Production migration of live Star Hawk customer data.
- Payment gateway integration changes.
- Mobile native apps.
- Inventing a new dashboard product (this is packaging + data + light vertical UX of the existing app).

## 4. Users & roles

| Role | Job-to-be-done | Frequency |
|------|----------------|-----------|
| Sales presenter (you) | Open demo, walk dashboards/invoices/shop, switch vertical flavour if needed | Per client meeting |
| Prospect (viewer) | Understand product value for their trade | Demo session |
| Demo admin (seeded) | Login, create invoice, browse clients (live demo actions) | During demo |
| Demo trade client (seeded portal user, optional) | Show portal history | Optional path |

## 5. Platform & environment

- **Target:** Web (existing Next.js + Supabase + Vercel stack)
- **Demo host:** Separate Vercel project + Supabase project recommended (not production Star Hawk data)
- **Constraints:** Reuse existing schema; bulk seed via Postgres (same pattern as wipe script)

## 6. Functional requirements

### Must have (P0)

- **R1 Demo brand:** Product presents as **Demo Builder Merchant** (name, titles, fallbacks, company_settings seed). Logo/theme adjustable via existing Brand settings.
- **R2 Demo seed clients:** Seed approximately **100** clients with realistic UK trade identities (names, companies, postcodes, phones/emails, account numbers, mix of credit terms).
- **R3 Demo seed history:** Seed **~2–3 years** of trading documents per active client pattern:
  - Order cadence: weekly, every other week, or ~2×/week depending on client "activity tier" / industry.
  - Invoices with **2 to ~15** line items.
  - Mix of quotations and invoices; statuses draft / sent / partial / paid (realistic mix).
  - Payments that drive partial/paid via DB triggers.
  - Document numbers unique and historically dated (issue_date spans the window).
- **R4 Showcase density:** After seed, dashboard KPIs, sales charts, client history, and invoice lists look populated and demo-ready.
- **R5 Repeatable pipeline:** Documented wipe + reseed scripts (safe for dedicated demo DB only).
- **R6 Construction vertical works out of the box:** Existing catalog + landing remain the default full vertical (already has products/images).
- **R7 Vertical storytelling:** Support at least the following demo verticals as **content packs** (landing hero/FAQ/services positioning + category framing): construction, plumbing, electrician/electrical, windows, tile. User can switch presentation for a client visit.
- **R8 Demo runbook:** Short guide: env vars, seed command, admin login, suggested demo script (homepage → catalogue → dashboard → client → invoice PDF).

### Should have (P1)

- **R9 Sample products per non-construction vertical:** Enough products (with images or solid placeholders) that catalogue/landing are not empty for plumbing / electrical / windows / tile when that pack is active.
- **R10 Vertical switcher:** Env or settings flag (e.g. `DEMO_VERTICAL=plumbing`) that drives landing copy + which categories are emphasized; not a full multi-tenant rewrite.
- **R11 Demo watermark / banner:** Optional subtle "DEMO" indicator so prospects know it is a demonstration environment.
- **R12 Seed portal clients:** A few clients with portal logins for portal walkthrough.

### Nice to have (P2)

- **R13** Per-vertical marketing images/hero sets.
- **R14** Rewrite or hide blog/guides that still say Star Hawk.
- **R15** One-click "Reset demo data" button in admin (script-backed).
- **R16** Separate deploy automation (CI) for demo environment.

## 7. Non-functional requirements

- **Performance:** Seed completes in reasonable time on a demo DB (target under ~5–10 minutes for full history); app remains responsive with thousands of invoices (existing indexes assumed; add if seed exposes gaps).
- **Security / privacy:** Synthetic data only (no real customer PII). Seed only against demo credentials. Never run wipe against production without explicit operator confirmation.
- **Reliability:** Seed is idempotent via wipe-then-seed, or documented re-run procedure.
- **Accessibility:** No regression on existing UI a11y for brand/landing changes.
- **Localization:** English UK (GBP, VAT 20%, UK addresses) unless later requested.

## 8. Data & integrations

- **Entities:** clients, invoices, invoice_items, payments, products (per vertical), company_settings, document_sequences, optional client portal profiles.
- **External:** Same as production stack (Supabase, optional Resend for email demos).
- **Auth:** Existing admin bootstrap; seed binds `created_by` to demo admin user.

## 9. Success criteria (acceptance of the product)

- [ ] Demo site loads as Demo Builder Merchant (no primary Star Hawk branding in chrome/settings defaults).
- [ ] ~100 clients visible in Clients list with plausible names/companies.
- [ ] Dashboard charts and invoice lists show multi-year activity without empty-state embarrassment.
- [ ] Spot-check invoices: 2–15 lines, correct VAT/totals, varied statuses, payments present on paid/partial.
- [ ] At least one non-construction vertical pack can be shown (landing + product story) for a client meeting.
- [ ] Wipe + reseed documented and runnable on a demo DB.
- [ ] Suggested live demo path works end-to-end without code errors.

## 10. Open questions

| ID | Question | Default assumption if unanswered |
|----|----------|----------------------------------|
| Q1 | Exact brand string: "Demo Builder Merchant" vs "Demo BM" vs "Demo Merchant"? | **Demo Builder Merchant** |
| Q2 | Vertical model: (A) switchable content packs in one deploy, (B) separate deploys/DBs per vertical, (C) single construction demo only + verbal "works for any trade"? | **A: switchable packs**, construction default |
| Q3 | How deep for non-construction catalogs: full price lists or 30–80 sample SKUs each? | **Sample SKUs (P1)**, not full industry catalogs |
| Q4 | Separate Supabase/Vercel for demo vs reuse existing project? | **Separate demo project** (recommended) |
| Q5 | Keep production Star Hawk code defaults and only override via demo env, or rename defaults in repo? | **Demo-aware defaults + env**; avoid breaking production brand when env unset |
| Q6 | Seed volume exact: 100 clients fixed? Years: 2 or 3? | **100 clients, 30 months (~2.5 years)** |
| Q7 | Include picker/driver workflow demos in seed? | **Light:** some loaded/delivered picking statuses; not full ops simulation |

## 11. Assumptions log

- A1: Product is already polished; work is **demo packaging + data + vertical presentation**, not feature rewrite.
- A2: Construction catalog already in DB/images is sufficient for the construction vertical.
- A3: Multi-tenant architecture is out of scope for this campaign.
- A4: Historical invoices will be inserted via direct SQL/`pg` (not server actions).
- A5: User will provide or create a dedicated demo Supabase project for safe wipe/seed.
- A6: Currency is GBP; VAT default 20%.
- A7: Clients are UK trade firms (builders, plumbers, electricians, window installers, tilers, etc.) even when vertical pack focuses marketing copy.

## 12. Research seeds (S1.5)

- Category: B2B merchant / trade counter SaaS demos
- Vertical content packs vs multi-tenant
- Realistic B2B order frequency for trade accounts
