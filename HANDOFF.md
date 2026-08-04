# HANDOFF

## Mode
Demo fully seeded for sales: products, multi-year invoices, quotes, campaigns, temp products, picker/driver.

## Live credentials (also in local `DEMO_CREDENTIALS.md`, gitignored)

| Role | Email | Password | Where |
|------|-------|----------|--------|
| **Admin** | `admin@demo-builder.com` | `A1b2c3d4@` | **`/admin-login`** → `/dashboard` |
| **Picker** | `picker@demo-builder.com` | `A1b2c3d4@` | **`/admin-login`** → `/picker` (auto) |
| **Driver** | `driver@demo-builder.com` | `A1b2c3d4@` | **`/admin-login`** → `/driver` (auto) |

All staff use **one** sign-in URL (`/admin-login`). Role routing is automatic.
| **Client portal** | e.g. `andrew.johnson.0@demo-trade.example` | `DemoClient1!` | `/login` |

Regenerate the local cheat-sheet anytime:

```bash
DEMO_SEED_CONFIRM=yes npm run seed:demo:extras
```

## Seeded data (verified)

| Area | Count / notes |
|------|----------------|
| Products | 364 active (8 temporary `TEMP-*`) |
| Campaigns | Summer Trade Sale (live 12.5%), Winter Clearance (20%), Spring Kick-off (paused 8%) |
| Clients | 100 |
| Invoices | 4184 (span ~2022-08 → 2026-08) |
| Quotations | 581 (converted / sent / draft mix) |
| Quote requests | 10 inbox rows (pending / reviewed / invoiced / rejected) |
| Payments | 3666 |
| Picker open | ~160 invoices ready to pick |
| Driver loads | 12 printed loads assigned to driver |

Staff password logins verified via Supabase `signInWithPassword`.

## Scripts

| Script | Purpose |
|--------|---------|
| `seed-demo-catalog.mjs` | ≥250 product SKUs |
| `seed-demo-history.mjs` | clients + multi-year invoices |
| `seed-portal-accounts.mjs` | client portal users |
| `seed-demo-extras.mjs` | quotes inbox, campaigns, temp products, staff, picker/driver loads |

## Operator

1. Hard-refresh production after deploy if needed.
2. Login paths above for the live demo walkthrough.
3. Full reseed: catalog → history `--wipe-first` → portal → extras.
4. If **Clients shows 0 accounts**, **Unknown client**, or **invoice PDF not found**: run
   `supabase/seed/00f_fix_clients_columns.sql` (or `node scripts/apply-00f-clients.mjs`).
   Already applied on the current demo Supabase project (2026-08-04).

## Security passwords (Settings → Security)

If Payments / Client Account / Data Deletion cannot be set:

```bash
node scripts/apply-07-user-security.mjs
```

Demo admin action password (all three): `A1b2c3d4@`

## Data fix status (2026-08-04)

| Issue | Status |
|-------|--------|
| Clients 0 / Unknown client | Schema `00f` applied + resilient loaders |
| Invoice PDF "not found" | Discount columns added + lean PDF select + clearer 403 |
| Product discounts zero while campaigns live | Dashboard merges campaign products into discounts hero |

## Do not

- Run wipe against a real customer database.
- Commit `DEMO_CREDENTIALS.md` (gitignored).
