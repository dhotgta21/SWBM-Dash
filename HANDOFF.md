# HANDOFF

## Mode
Demo data seed complete on live Supabase (plus prior Analytics/product-detail code fixes).

## Stage
S11 residual / demo readiness.

## Live database (verified 2026-08-04)

| Metric | Value |
|--------|------:|
| Active products | **356** (≥250) |
| Clients | **100** |
| Invoices | **4184** |
| Quotations | **581** |
| Payments | **3666** |
| Client portal profiles | **100** |
| Invoice span | **2022-08-01 → 2026-08-04** (~4 years) |
| Client tenure mix | 25 short (&lt;18m) / 35 mid / 25 long / 15 very long (≥42m) |
| Seasonality | Peak/trough sales ratio ~170x; monthly invoice counts vary strongly |

Company brand row: **Demo Builder Merchant**.

### Logins
| Who | Path | Creds |
|-----|------|--------|
| Staff admin | `/admin-login` | `dhotgta@gmail.com` / `A1b2c3d4@` (if set via 05_demo_admin) |
| Client portal | `/login` | any client email (`*.@demo-trade.example`) / `DemoClient1!` |

### What was run on live Supabase
1. `00e_fix_dashboard_deleted_at_and_product_variants.sql` (soft-delete + product variant columns)
2. `00a_add_picking_columns.sql`
3. `DEMO_SEED_CONFIRM=yes node scripts/seed-demo-catalog.mjs --target 280` → 356 active
4. `DEMO_SEED_CONFIRM=yes node scripts/seed-demo-history.mjs --clients 100 --months 48 --wipe-first`
5. `04_demo_company_brand.sql`
6. `node scripts/seed-portal-accounts.mjs` (100 portal users)

### App code (previous session, commit `3eb36cd`)
- Dashboard resilient to missing `deleted_at` (columns now present live too)
- Product detail column-set fallbacks
- **Deploy still recommended** if that commit is not on Vercel yet

### Scripts added
- `scripts/seed-demo-catalog.mjs` + npm `seed:demo:catalog`
- History seeder: default 48 months, mixed client tenure, seasonal volume

## Operator next steps
1. **Hard-refresh** Analytics after login: should show multi-year KPIs/charts.
2. **Catalogue /quote/bricks** and product detail URLs (live check already showed product titles loading).
3. **Deploy** local commit(s) if Vercel is behind `main`.
4. Optional reseed:
   ```bash
   DEMO_SEED_CONFIRM=yes npm run seed:demo:catalog
   DEMO_SEED_CONFIRM=yes node scripts/seed-demo-history.mjs --clients 100 --months 48 --wipe-first
   node scripts/seed-portal-accounts.mjs
   ```

## Do not
- Run wipe/seed against a real customer production project.
- Wipe products when only refreshing invoices (history wipe keeps products).
