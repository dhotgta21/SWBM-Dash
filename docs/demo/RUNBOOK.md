# Demo Builder Merchant – operator runbook

How to stand up a **client-ready demo** of this product for sales visits.

## What you get

| Piece | Purpose |
|-------|---------|
| **Brand** | `Demo Builder Merchant` when demo mode is on |
| **Vertical packs** | construction, plumbing, electrical, windows, tile landing stories |
| **History seed** | ~100 clients + multi-year invoices/payments |
| **Sample SKUs** | Non-construction catalogue lines for pack demos |

## 1. Dedicated environment (recommended)

Use a **separate** Supabase project + Vercel project from production Star Hawk.

1. Create Supabase project; run `supabase/schema.sql` (or full migration chain).
2. Create Vercel project from this repo; point env at the demo Supabase.
3. Bootstrap the first admin via `/register` while the DB has zero profiles.

## 2. Environment variables

Copy `.env.example` → `.env.local` (local) or Vercel env (hosted).

**Required for app**

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_APP_URL` / `NEXT_PUBLIC_SITE_URL` (demo domain)
- Postgres URL for scripts: `POSTGRES_URL_NON_POOLING` (or `POSTGRES_URL`)

**Demo mode / brand**

Demo Builder Merchant is the **default** brand for this package (logo files + name).  
You do not need `NEXT_PUBLIC_DEMO_MODE=true` for the name/logo, but keep it set for clarity:

```env
NEXT_PUBLIC_DEMO_MODE=true
DEMO_MODE=true
NEXT_PUBLIC_DEMO_VERTICAL=construction
DEMO_VERTICAL=construction
```

Also run `04_demo_company_brand.sql` so the **database** `company_settings` row is not still “Star Hawk…” (dashboard/invoices load the name from DB).

Valid verticals: `construction` | `plumbing` | `electrical` | `windows` | `tile`

When demo mode is on, the app **does not require**:

| Service | Demo behaviour |
|---------|----------------|
| **Resend** | No outbound email. Staff/client invites and password resets show a **copyable link** in the UI instead. |
| **Cloudflare Turnstile** | Captcha hidden and skipped on login / register / public forms. |
| **GoAddress / Integrations UI** | Settings → Integrations is hidden. Postcode lookup does not call GoAddress (manual address entry; free postcodes.io only). |
| **Invoice “email PDF”** | Returns a clear demo message; use download / share link. |

**Supabase CAPTCHA (still matters even when the app has no Turnstile):**

The app does **not** show Cloudflare Turnstile in demo mode. Supabase can still
block password sign-in if **Attack Protection CAPTCHA** is on.

1. Supabase Dashboard → **Authentication** → **Attack Protection** (or Bot and Abuse Protection)  
2. **Turn CAPTCHA / Cloudflare Turnstile OFF** for this demo project  
3. Save  

If CAPTCHA stays on, the app tries a **demo-only** password verify + session mint
when `POSTGRES_URL` / `POSTGRES_URL_NON_POOLING` is set on Vercel. Prefer
turning CAPTCHA off so ordinary `signInWithPassword` works.

Also confirm **Email confirmations** are off or the demo admin is already
confirmed (`05_demo_admin.sql` sets `email_confirmed_at`).

**Products not showing (homepage / catalogue / admin):**

**Fastest fix (one SQL file):** open Supabase → **SQL Editor** → paste and run:

`supabase/seed/00_ALL_IN_ONE_fix_products.sql`

You must see `public_visible` **> 0** in the result. Then hard-refresh the site
(and redeploy if you have not pulled the latest app code).

Also ensure Vercel has **`SUPABASE_SERVICE_ROLE_KEY`** set (same project as the
anon URL/key). The app now reads the catalogue with the service role so broken
anon RLS cannot hide products.

Without that env key, only anon RLS works and empty lists are common on partial schemas.

**Seed safety**

```env
DEMO_SEED_CONFIRM=yes
```

Only set this when intentionally wiping/seeding a **demo** database.

## 3. Seed the demo database

### Option A – SQL Editor (easiest on Supabase)

Run these files **in order** in Supabase → **SQL Editor** (after `schema.sql` succeeds and you have registered the first admin):

| Order | File | Purpose |
|-------|------|---------|
| 0 (optional) | `supabase/seed/00_wipe_demo_clients_invoices.sql` | Clear old demo clients/invoices |
| 0a **(if payments fail)** | `supabase/seed/00a_add_picking_columns.sql` | Adds `picking_status` columns missing from partial schema |
| **0b (if no products)** | `supabase/seed/00b_fix_products_columns_and_rls.sql` | Adds `deleted_at` / `is_temporary` + anon/auth product SELECT RLS |
| 0c (legacy) | `supabase/seed/00c_fix_products_deleted_at.sql` | Minimal deleted_at + RLS (prefer **0b**) |
| **0e (if Analytics blank)** | `supabase/seed/00e_fix_dashboard_deleted_at_and_product_variants.sql` | invoices/payments `deleted_at` + product variants |
| **0f (Clients=0 / Unknown client / PDF not found)** | `supabase/seed/00f_fix_clients_columns.sql` | clients `deleted_at`/`is_temporary`/`account_balance` + invoice discount cols for PDF |
| **6 (company NAP / bank / reply-to)** | `supabase/seed/06_demo_company_details.sql` | Example address, phone, email, VAT, company reg, bank, reply-to |
| **7 (Security passwords fail)** | `supabase/seed/07_fix_user_security_passwords.sql` | `user_security` + payment / client-account / deletion password RPCs; seeds admin demo passwords |
| **8 (Could not record deposit)** | `supabase/seed/08_fix_client_wallet.sql` | client wallet ledger + `deposit_to_client_account` / apply-balance RPCs |
| 1 | `supabase/seed/01_demo_clients_invoices.sql` | ~50 clients + ~2 years invoices/payments |
| 2 **(for landing grid)** | `supabase/seed/02_construction_products.sql` | Construction products + public product read (categories on homepage) |
| 2b (optional) | `supabase/seed/02_demo_vertical_products.sql` | Sample plumbing/electrical/windows/tile SKUs |
| 3 | `supabase/seed/03_demo_client_portal_accounts.sql` | Portal login for **every** client |
| 4 | `supabase/seed/04_demo_company_brand.sql` | Force company name + logo wordmark to **Demo Builder Merchant** |
| 5 | `supabase/seed/05_demo_admin.sql` | Staff admin `dhotgta@gmail.com` / `A1b2c3d4@` |

**Admin:** run `05_demo_admin.sql` (or let `01` create one if missing):

| Field | Value |
|-------|--------|
| Email | `dhotgta@gmail.com` |
| Password | `A1b2c3d4@` |
| Sign-in | `/admin-login` |

You no longer need `/register` before seeding.

To change volume, edit at the top of the `DO $$` block in file 01:

```sql
v_client_count int := 50;  -- try 20 first if the editor times out
v_months       int := 24;
```

If the SQL Editor times out, lower `v_client_count` to `20` and re-run after wipe.

### Client portal logins (after step 3)

Run `03_demo_client_portal_accounts.sql`. Then each client can sign in at **`/login`** (client portal):

| Field | Value |
|-------|--------|
| **Email** | The client’s email (e.g. `james.smith.1@demo-trade.example`) |
| **Password** | `DemoClient1!` (same for all demo portal users) |

The SQL result panel lists sample company → email pairs after it runs.

### Option B – Node scripts (same data, needs Postgres URL)

From the project root (with `.env.local` loaded):

```bash
# Optional: clear existing clients + invoices first
DEMO_SEED_CONFIRM=yes npm run wipe:demo-clients

# Dense catalogue (≥250 SKUs across construction + trade verticals)
DEMO_SEED_CONFIRM=yes npm run seed:demo:catalog

# ~100 clients + multi-year invoices (default 48 months, mixed tenure 1–4y)
DEMO_SEED_CONFIRM=yes npm run seed:demo
# Equivalent explicit:
# DEMO_SEED_CONFIRM=yes node scripts/seed-demo-history.mjs --clients 100 --months 48 --wipe-first

# Smaller local smoke seed
DEMO_SEED_CONFIRM=yes node scripts/seed-demo-history.mjs --clients 20 --months 12 --wipe-first

# Extra sample products for plumbing / electrical / windows / tile (optional)
DEMO_SEED_CONFIRM=yes npm run seed:demo:verticals

# Quote inbox, campaigns, temporary products, admin/picker/driver + loads
DEMO_SEED_CONFIRM=yes npm run seed:demo:extras
# Writes local DEMO_CREDENTIALS.md (gitignored)
```

Both options:

- Require an existing **admin** user (`profiles.role = 'admin'`)
- Insert clients, invoices, quotations, line items, payments
- Sync document number sequences  
- SQL option also sets company name to **Demo Builder Merchant**

## 4. Switch industry for a meeting

1. Set `NEXT_PUBLIC_DEMO_VERTICAL` (and optionally `DEMO_VERTICAL`) to the prospect’s trade.
2. Redeploy or restart `npm run dev` (Next inlines `NEXT_PUBLIC_*` at build).
3. Open `/` – hero, FAQ (non-construction), and category order follow the pack.
4. Browse `/catalogue` – construction uses the main catalog; other verticals need `seed:demo:verticals`.

No multi-tenant switcher UI is required; env is intentional for sales control.

## 5. Suggested live demo path (~10 minutes)

1. **Homepage** – vertical hero story, categories, trust strip  
2. **Catalogue / product** – open a stocked line  
3. **Quote** – add items to cart (optional)  
4. **Staff login** – single URL `/admin-login` for admin, picker, and driver (auto-routes by role; no captcha in demo mode)  
5. **Dashboard** – KPIs and charts populated by seed  
6. **Clients** – open a “hot” trade account with long history  
7. **Invoice** – open a multi-line invoice, show PDF / share if useful  
8. **Settings → Team** – invite staff / picker / driver (copy invite link; no Resend)  
9. **Settings → Brand** – show logo/colours are configurable  

### Creating team members in demo (no email)

1. Settings → Team → invite with role `staff` | `admin` | `picker` | `driver`.  
2. Success message includes a **one-time invite URL**.  
3. Open that URL (incognito if needed) → set password → sign in as that role.

## 6. Reset before the next meeting

```bash
DEMO_SEED_CONFIRM=yes npm run wipe:demo-clients
DEMO_SEED_CONFIRM=yes npm run seed:demo
DEMO_SEED_CONFIRM=yes npm run seed:demo:verticals
```

## 7. Production safety

| Do | Do not |
|----|--------|
| Seed only demo Supabase projects | Run wipe/seed against production customer data |
| Keep `DEMO_SEED_CONFIRM` unset on production | Commit real secrets |
| Leave `NEXT_PUBLIC_DEMO_MODE` unset on production Star Hawk | Assume multi-tenant isolation (single company row) |

When demo env vars are **unset**, fallbacks remain **Star Hawk Builders Merchant** so the same codebase can serve production.

## 8. Troubleshooting

| Symptom | Check |
|---------|--------|
| Seed refuses to run | `DEMO_SEED_CONFIRM=yes` |
| No admin for seed | Register first admin on empty DB |
| Landing still construction copy | `NEXT_PUBLIC_DEMO_MODE=true` and rebuild; vertical env |
| Empty non-construction categories | Run `seed:demo:verticals` |
| Brand still Star Hawk in chrome | Demo mode env + seed company name; hard refresh |
| Document number collisions later | Seed updates `document_sequences`; re-seed if you wiped partially |

## 9. Scripts reference

| npm script | Command |
|------------|---------|
| `seed:demo` | `node scripts/seed-demo-history.mjs` |
| `seed:demo:verticals` | `node scripts/seed-demo-vertical-products.mjs` |
| `wipe:demo-clients` | `node scripts/wipe-invoices-and-clients.mjs` |
