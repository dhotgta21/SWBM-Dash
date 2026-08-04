# Star Hawk Builders Merchant — Professional Invoice & Dashboard System

A secure, multi-user invoice and quotation management system built with **Next.js 16+**, **Supabase**, and **Tailwind CSS**. Deployed on **Vercel**.

## Features

- **Authentication** — Email/password login with Supabase Auth. The first admin is bootstrapped in-app via a sealed `/register` route (see [Bootstrap the first admin](#4-bootstrap-the-first-admin)).
- **Client Management** — Add clients with name, email, phone, and full address. Search and view client history.
- **Product Catalog** — Searchable product database migrated from the original product list.
- **Invoices & Quotations** — Create professional invoices and quotations with line items, VAT, auto-generated document numbers.
- **Payments** — Record payments against invoices with automatic balance and status updates.
- **Dashboard** — KPI cards, sales charts, sales by client, and due/overdue invoice lists.
- **PDF Export** — Download branded PDFs, email via mailto, or share via WhatsApp.
- **Row Level Security** — Supabase RLS policies keep each user's data protected.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 16 (App Router) |
| Styling | Tailwind CSS |
| UI Components | Custom + shadcn/ui inspired |
| Database | Supabase (Postgres) |
| Auth | Supabase Auth |
| State | React Query, Zustand |
| Charts | Recharts |
| PDF | @react-pdf/renderer |
| Hosting | Vercel |

## Project Structure

```
app/
  (auth)/          # Login, register, reset password pages
  (dashboard)/     # Dashboard, clients, invoices, products, settings
components/        # Reusable UI and feature components
lib/
  actions/         # Server actions for CRUD operations
  supabase/        # Supabase client configurations
  database.types.ts # Supabase TypeScript types
  utils.ts         # Helpers and formatters
proxy.ts           # Next.js 16 proxy (replaces middleware.ts)
supabase/migrations/ # SQL migrations and seed data
legacy/            # Original static app (backed up)
public/            # Static assets including Logo.png
```

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Set up Supabase

1. Create a new project at [supabase.com](https://supabase.com).
2. Go to **Project Settings > API** and copy:
   - Project URL
   - `anon` public API key
   - `service_role` secret API key
3. Open the **SQL Editor** and run the consolidated schema:
   - `supabase/schema.sql`

   The file is fully idempotent and safe to re-run on a database that
   already has the older 001–018 chain applied (every CREATE has
   `IF NOT EXISTS`, every function uses `CREATE OR REPLACE`, every
   trigger / policy is dropped-then-recreated). The header comment
   documents the lineage of every block.

### 3. Configure environment variables

Copy `.env.example` to `.env.local` and fill in your Supabase credentials:

```bash
cp .env.example .env.local
```

```env
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
# If your Supabase project uses the newer secret key format, use this instead:
# SUPABASE_SECRET_KEY=your-secret-key
```

`NEXT_PUBLIC_APP_URL` is used for password-reset redirect links and must match your deployment domain in production. **Never commit `.env.local`** — it's in `.gitignore`.

### 4. Bootstrap the first admin

The `handle_new_user` trigger no longer auto-promotes the first user
to admin. Bootstrap is handled in-app:

1. Visit `/register` while the database has zero users. The form
   creates the first account and automatically promotes it to `admin`
   via the atomic `claim_first_admin()` RPC.
2. Once any profile exists, `/register` returns 404 and cannot be
   reopened without direct database access.
3. Sign in at `/login`.

If you already have a single staff account from before this flow
existed, sign in and use the "Claim admin access" prompt that appears
while the system has no admins.

Full details in [`docs/SECURITY.md`](./docs/SECURITY.md).

### 5. Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### 6. Configure Auth Redirects

In your Supabase dashboard, go to **Authentication > URL Configuration** and set:

- Site URL: `http://localhost:3000` (or your production domain, e.g. `https://www.starhawkbm.com`)
- Redirect URLs:
  - `http://localhost:3000/**`
  - `https://your-domain.vercel.app/**`
  - `https://www.starhawkbm.com/auth/callback*` (or `https://www.starhawkbm.com/**`)

## Deploying to Vercel

1. Push your code to GitHub.
2. Import the repository in [Vercel](https://vercel.com).
3. Add the environment variables from `.env.local.example` in **Project Settings > Environment Variables**.
4. Deploy.
5. Update Supabase Auth redirect URLs to include your production domain.

> **Note:** Next.js 16 uses `proxy.ts` instead of `middleware.ts` for route-level request handling. Do not rename or move this file.

## Database Schema Overview

- `profiles` — extends Supabase auth users, stores role and name.
- `company_settings` — single-row business configuration.
- `company_bank_details` — bank details printed on invoices.
- `clients` — customer records.
- `products` — product catalog with categories.
- `invoices` — stores invoices and quotations.
- `invoice_items` — line items for each invoice.
- `payments` — payment records linked to invoices.
- `document_sequences` — atomic document number generation.

## Security

- All business tables have Row Level Security (RLS) enabled.
- Users can only access records they created unless they are an admin.
- The service role key is only used in server-side code.
- Document numbers are generated atomically via a Postgres function.
- Per-request nonce-based CSP is injected by `proxy.ts` — `'unsafe-eval'`
  is removed in production.
- Sign-in, password-reset, email-send, geocode, public invoice view, and
  team-management endpoints are all rate-limited via a Supabase-backed
  shared store (survives serverless cold starts).
- Audit triggers write to `audit_logs` on every change to invoices,
  payments, profiles, company_settings, and company_bank_details.
- The first admin is bootstrapped in-app via a sealed `/register` route
  or the "Claim admin access" recovery prompt. The trigger never
  auto-promotes. See [`docs/SECURITY.md`](./docs/SECURITY.md) for the
  full operational runbook.

## Original App

The original static quotation system has been backed up to the `legacy/` directory for reference.

## License

Private — for Star Hawk Builders Merchant internal use.
