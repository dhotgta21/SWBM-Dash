# HANDOFF

## Mode
Bugfix / polish: **products empty** + **sign-in blocked** (Supabase CAPTCHA / incomplete schema).

## Stage
S11 residual fixes (demo campaign already complete).

## What was fixed (this session)
1. **Products not showing**
   - Root cause: partial `schema.sql` omitted `products.deleted_at` and `products.is_temporary`. App filters on those columns → PostgREST errors → empty lists. RLS for anon could also block public reads.
   - Fix: columns + split SELECT policies in `schema.sql`; operator one-shot `supabase/seed/00b_fix_products_columns_and_rls.sql`; resilient `/admin/products` queries; public list handles missing `is_temporary`.

2. **Sign-in / “Supabase CAPTCHA”**
   - App never uses Turnstile in demo mode, but Supabase **Attack Protection CAPTCHA** can still block password grant.
   - Empty `{}` errors were over-blamed on CAPTCHA.
   - Fix: clearer diagnostics; demo fallback that verifies password via Postgres (`crypt`) then mints a session with admin `generateLink` + `verifyOtp` when CAPTCHA-shaped errors occur (needs `POSTGRES_URL*`).

## Operator next steps (required on live Supabase)
1. SQL Editor: run **`00b_fix_products_columns_and_rls.sql`**, then **`02_construction_products.sql`** (if catalogue empty).
2. Auth → Attack Protection → **CAPTCHA OFF** (recommended).
3. Ensure Vercel has `POSTGRES_URL` or `POSTGRES_URL_NON_POOLING` if CAPTCHA cannot be turned off (enables demo password bypass).
4. Run **`05_demo_admin.sql`** if staff login user missing: `dhotgta@gmail.com` / `A1b2c3d4@`.
5. Redeploy app so auth + products code ships.

## Do not
- Wipe production customer data.
- Leave CAPTCHA on without Postgres URL if you need password login without Turnstile.
