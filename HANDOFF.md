# HANDOFF

## Mode
Bugfix: **Analytics dashboard blank** + **public product detail 404**.

## Stage
S11 residual fixes (demo campaign already complete).

## What was fixed (this session)
1. **Analytics: "Unable to load dashboard data"**
   - Root cause: live Supabase missing `invoices.deleted_at` and `payments.deleted_at`. Dashboard queries filtered on those columns and threw.
   - Fix: retry without soft-delete filters in `lib/dashboard.ts` and `lib/money-collection.ts` when the column is missing.

2. **Product detail "Product not found" (category list still worked)**
   - Root cause: live DB missing `products.materials` (and related variant columns). List used multi-column fallbacks; get-by-code did not.
   - Fix: shared `PUBLIC_PRODUCT_COLUMN_SETS` walk in `getPublicProductByCode` (same resilience as list), plus a CORE column set with sale/SEO fields but no materials pack.

3. **Operator SQL (permanent schema parity)**
   - `supabase/seed/00e_fix_dashboard_deleted_at_and_product_variants.sql` adds the missing columns safely (`IF NOT EXISTS`).

## Operator next steps (required for production)
1. **Deploy** this branch to Vercel (app-side fix is enough for both bugs).
2. **Optional but recommended:** Supabase SQL Editor → run **`supabase/seed/00e_fix_dashboard_deleted_at_and_product_variants.sql`** once.
3. Hard-refresh Analytics and open e.g. https://swbm-dash.vercel.app/products/ENG-CLAS (from Bricks category).
4. If products list empty again: still run `00_ALL_IN_ONE_fix_products.sql` / `00b` as before.
5. Auth CAPTCHA still recommended OFF on the demo project (prior incident).

## Verify after deploy
- `/dashboard` (admin) shows Money collection + charts (not the red error banner).
- `/quote/bricks` → click a product → product page loads with name/price/Add to quote.
- Direct: `/products/ENG-CLAS` and `/products/WIRE-FN` are not "Product not found".

## Do not
- Wipe production customer data.
- Force-push or amend published history without explicit request.
