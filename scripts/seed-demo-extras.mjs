#!/usr/bin/env node
/**
 * Demo extras: quote requests, temporary products, campaigns,
 * admin/picker/driver staff accounts, picker queue + driver loads.
 *
 *   DEMO_SEED_CONFIRM=yes node scripts/seed-demo-extras.mjs
 *
 * Staff passwords: A1b2c3d4@
 * Client portal passwords: DemoClient1! (from seed-portal-accounts)
 */

import { readFileSync, existsSync, writeFileSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import { Client } from 'pg'
import { createClient } from '@supabase/supabase-js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return
  for (const line of readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const idx = trimmed.indexOf('=')
    if (idx === -1) continue
    const key = trimmed.slice(0, idx).trim()
    let value = trimmed.slice(idx + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (key && !(key in process.env)) process.env[key] = value
  }
}

loadEnvFile(join(root, '.env.local'))
loadEnvFile(join(root, '.env'))

if (process.env.DEMO_SEED_CONFIRM !== 'yes') {
  console.error('Set DEMO_SEED_CONFIRM=yes to run this seed.')
  process.exit(1)
}

const STAFF_PASSWORD = 'A1b2c3d4@'
const CLIENT_PASSWORD = 'DemoClient1!'

/** Canonical demo staff accounts */
const STAFF = [
  {
    email: 'admin@demo-builder.com',
    role: 'admin',
    full_name: 'Demo Admin',
  },
  {
    email: 'picker@demo-builder.com',
    role: 'picker',
    full_name: 'Demo Picker',
  },
  {
    email: 'driver@demo-builder.com',
    role: 'driver',
    full_name: 'Demo Driver',
  },
  // Keep the legacy admin usable
  {
    email: 'dhotgta@gmail.com',
    role: 'admin',
    full_name: 'Demo Admin',
  },
  {
    email: 'demo.admin@demo-builder.example',
    role: 'admin',
    full_name: 'Demo Admin',
  },
]

const connectionString =
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_PRISMA_URL

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const service = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!connectionString || !url || !service) {
  console.error('Need POSTGRES_URL*, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const cleanConn = connectionString
  .replace(/[?&]sslmode=[^&]*/g, '')
  .replace(/\?&/, '?')
  .replace(/\?$/, '')

const pg = new Client({
  connectionString: cleanConn,
  ssl: { rejectUnauthorized: false },
})

const admin = createClient(url, service, {
  auth: { persistSession: false, autoRefreshToken: false },
})

function daysAgo(n) {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - n)
  return d
}

function isoDate(d) {
  return d.toISOString().slice(0, 10)
}

async function ensureDeliveryTables() {
  console.log('Ensuring delivery_loads tables…')
  await pg.query(`
    CREATE TABLE IF NOT EXISTS public.delivery_loads (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
      load_number int NOT NULL,
      status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','printed','completed')),
      picked_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
      printed_at timestamptz,
      completed_at timestamptz,
      assigned_driver_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
      assigned_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (invoice_id, load_number)
    );

    CREATE INDEX IF NOT EXISTS idx_delivery_loads_invoice_id
      ON public.delivery_loads(invoice_id);
    CREATE INDEX IF NOT EXISTS idx_delivery_loads_picked_by
      ON public.delivery_loads(picked_by);
    CREATE INDEX IF NOT EXISTS idx_delivery_loads_assigned_driver
      ON public.delivery_loads(assigned_driver_id)
      WHERE assigned_driver_id IS NOT NULL;

    CREATE TABLE IF NOT EXISTS public.delivery_load_items (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      load_id uuid NOT NULL REFERENCES public.delivery_loads(id) ON DELETE CASCADE,
      invoice_item_id uuid NOT NULL REFERENCES public.invoice_items(id) ON DELETE CASCADE,
      quantity numeric(12,3) NOT NULL CHECK (quantity > 0),
      status text NOT NULL CHECK (status IN ('loaded','out_of_stock','order')),
      stock_alert_type text CHECK (stock_alert_type IN ('low_stock','out_of_stock','order')),
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (load_id, invoice_item_id)
    );

    CREATE INDEX IF NOT EXISTS idx_delivery_load_items_load_id
      ON public.delivery_load_items(load_id);
    CREATE INDEX IF NOT EXISTS idx_delivery_load_items_invoice_item_id
      ON public.delivery_load_items(invoice_item_id);

    ALTER TABLE public.delivery_loads ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.delivery_load_items ENABLE ROW LEVEL SECURITY;

    GRANT SELECT, INSERT, UPDATE, DELETE ON public.delivery_loads TO authenticated, service_role;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.delivery_load_items TO authenticated, service_role;
  `)

  // Allow driver role on profiles (live DB may have an older check without driver)
  await pg.query(`
    ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
    ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_valid;
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_role_check
      CHECK (role IN ('admin', 'staff', 'client', 'picker', 'driver'));
  `)
  console.log('  delivery tables OK')
}

/**
 * Create/update staff via Postgres (same pattern as 05_demo_admin.sql).
 * Avoids Auth Admin API rate limits when seeding several users.
 */
async function ensureStaffUser({ email, role, full_name }) {
  await pg.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`)

  const existing = await pg.query(
    `SELECT id FROM auth.users WHERE lower(email) = lower($1) LIMIT 1`,
    [email]
  )

  let userId
  if (existing.rows[0]) {
    userId = existing.rows[0].id
    await pg.query(
      `UPDATE auth.users
          SET encrypted_password = crypt($2, gen_salt('bf')),
              email_confirmed_at = COALESCE(email_confirmed_at, now()),
              raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb)
                || jsonb_build_object(
                     'full_name', $3::text,
                     'invited_role', $4::text,
                     'demo_staff', true
                   ),
              updated_at = now(),
              confirmation_token = COALESCE(confirmation_token, ''),
              recovery_token = COALESCE(recovery_token, ''),
              email_change_token_new = COALESCE(email_change_token_new, ''),
              email_change_token_current = COALESCE(email_change_token_current, ''),
              reauthentication_token = COALESCE(reauthentication_token, '')
        WHERE id = $1`,
      [userId, STAFF_PASSWORD, full_name, role]
    )
    console.log(`  updated auth ${email} (${role})`)
  } else {
    userId = randomUUID()
    const inst = await pg.query(`SELECT id FROM auth.instances LIMIT 1`)
    const instanceId = inst.rows[0]?.id || '00000000-0000-0000-0000-000000000000'

    await pg.query(
      `INSERT INTO auth.users (
         instance_id, id, aud, role, email, encrypted_password,
         email_confirmed_at,
         confirmation_token, recovery_token, email_change_token_new,
         email_change_token_current, reauthentication_token,
         email_change, phone_change, phone_change_token,
         raw_app_meta_data, raw_user_meta_data,
         created_at, updated_at, is_super_admin, is_sso_user, is_anonymous
       ) VALUES (
         $1,$2,'authenticated','authenticated',$3, crypt($4, gen_salt('bf')),
         now(),
         '','','','','','','','',
         jsonb_build_object('provider','email','providers', jsonb_build_array('email')),
         jsonb_build_object('full_name',$5::text,'invited_role',$6::text,'demo_staff',true),
         now(), now(), false, false, false
       )`,
      [instanceId, userId, email, STAFF_PASSWORD, full_name, role]
    )

    await pg.query(
      `INSERT INTO auth.identities (
         id, user_id, identity_data, provider, provider_id,
         last_sign_in_at, created_at, updated_at
       ) VALUES (
         gen_random_uuid(), $1::uuid,
         jsonb_build_object('sub',$1::text,'email',$2::text,'email_verified',true,'phone_verified',false),
         'email', $1::text, now(), now(), now()
       )`,
      [userId, email]
    )
    console.log(`  created auth ${email} (${role})`)
  }

  // Identity may be missing on older users
  await pg.query(
    `INSERT INTO auth.identities (
       id, user_id, identity_data, provider, provider_id,
       last_sign_in_at, created_at, updated_at
     )
     SELECT gen_random_uuid(), $1::uuid,
            jsonb_build_object('sub',$1::text,'email',$2::text,'email_verified',true,'phone_verified',false),
            'email', $1::text, now(), now(), now()
      WHERE NOT EXISTS (
        SELECT 1 FROM auth.identities WHERE user_id = $1::uuid AND provider = 'email'
      )`,
    [userId, email]
  )

  await pg.query(
    `INSERT INTO public.profiles (id, email, full_name, role, is_active, created_by)
     VALUES ($1, $2, $3, $4, true, $1)
     ON CONFLICT (id) DO UPDATE SET
       email = EXCLUDED.email,
       full_name = EXCLUDED.full_name,
       role = EXCLUDED.role,
       is_active = true,
       client_id = NULL,
       failed_sign_in_attempts = 0,
       locked_until = NULL`,
    [userId, email, full_name, role]
  )

  return userId
}

async function seedTempProducts() {
  console.log('Seeding temporary walk-in products…')
  const temps = [
    ['TEMP-001', 'Walk-in Special Sand (temp)', 'TON', 'Aggregates & Cement', 65],
    ['TEMP-002', 'One-off Facing Brick Mix (temp)', 'EA', 'Bricks', 0.55],
    ['TEMP-003', 'Customer CLS Offcut Pack (temp)', 'PK', 'Timber', 18],
    ['TEMP-004', 'Site Clearance Fixings Bundle (temp)', 'BOX', 'Fixings', 22],
    ['TEMP-005', 'Temporary Scaffold Board Hire (temp)', 'DAY', 'Tools', 4.5],
    ['TEMP-006', 'Bespoke Lintel Cut (temp)', 'EA', 'Steel & Lintels', 95],
    ['TEMP-007', 'Job-lot Insulation Offcut (temp)', 'PK', 'Cavity Insulation', 28],
    ['TEMP-008', 'Urgent Drainage Fitting (temp)', 'EA', 'Drainage', 12.5],
  ]

  for (const [code, name, unit, category, price] of temps) {
    await pg.query(
      `INSERT INTO public.products (
         code, name, unit, category, default_price, description,
         is_active, is_temporary, deleted_at, created_at, updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,true,true,NULL,now(),now())
       ON CONFLICT (code) DO UPDATE SET
         name = EXCLUDED.name,
         unit = EXCLUDED.unit,
         category = EXCLUDED.category,
         default_price = EXCLUDED.default_price,
         is_active = true,
         is_temporary = true,
         deleted_at = NULL,
         updated_at = now()`,
      [code, name, unit, category, price, `Temporary catalogue line for demo (${name}).`]
    )
  }
  const r = await pg.query(
    `SELECT count(*)::int AS n FROM public.products WHERE coalesce(is_temporary,false)`
  )
  console.log(`  temporary products: ${r.rows[0].n}`)
}

async function seedCampaigns() {
  console.log('Seeding campaigns…')
  // Clear prior demo campaigns by name
  await pg.query(
    `DELETE FROM public.campaigns
      WHERE name IN ('Summer Trade Sale', 'Winter Clearance', 'Spring Kick-off')
         OR label IN ('SUMMER', 'WINTER', 'SPRING')`
  )

  const now = new Date()
  const summerStart = new Date(Date.UTC(now.getUTCFullYear(), 5, 1)) // Jun 1
  const summerEnd = new Date(Date.UTC(now.getUTCFullYear(), 7, 31, 23, 59, 59)) // Aug 31
  const winterStart = new Date(Date.UTC(now.getUTCFullYear(), 11, 1))
  const winterEnd = new Date(Date.UTC(now.getUTCFullYear() + 1, 1, 28, 23, 59, 59))
  const springStart = new Date(Date.UTC(now.getUTCFullYear(), 2, 1))
  const springEnd = new Date(Date.UTC(now.getUTCFullYear(), 4, 15, 23, 59, 59))

  const campaigns = [
    {
      name: 'Summer Trade Sale',
      discount_percent: 12.5,
      starts_at: summerStart.toISOString(),
      ends_at: summerEnd.toISOString(),
      label: 'SUMMER',
      is_paused: false,
      categories: ['Timber', 'Bricks', 'Blocks', 'Aggregates & Cement', 'Tools'],
    },
    {
      name: 'Winter Clearance',
      discount_percent: 20,
      starts_at: winterStart.toISOString(),
      ends_at: winterEnd.toISOString(),
      label: 'WINTER',
      is_paused: false,
      categories: ['Cavity Insulation', 'PIR Insulation', 'Plasterboard', 'Roofing'],
    },
    {
      name: 'Spring Kick-off',
      discount_percent: 8,
      starts_at: springStart.toISOString(),
      ends_at: springEnd.toISOString(),
      label: 'SPRING',
      is_paused: true, // show a paused campaign in admin UI
      categories: ['Drainage', 'Fixings', 'Sheet Materials'],
    },
  ]

  for (const camp of campaigns) {
    const ins = await pg.query(
      `INSERT INTO public.campaigns
         (name, discount_percent, starts_at, ends_at, label, is_paused, deleted_at)
       VALUES ($1,$2,$3,$4,$5,$6,NULL)
       RETURNING id`,
      [
        camp.name,
        camp.discount_percent,
        camp.starts_at,
        camp.ends_at,
        camp.label,
        camp.is_paused,
      ]
    )
    const campaignId = ins.rows[0].id
    const prods = await pg.query(
      `SELECT id FROM public.products
        WHERE is_active = true
          AND coalesce(is_temporary,false) = false
          AND deleted_at IS NULL
          AND category = ANY($1::text[])
        ORDER BY random()
        LIMIT 40`,
      [camp.categories]
    )
    for (const p of prods.rows) {
      await pg.query(
        `INSERT INTO public.campaign_products (campaign_id, product_id)
         VALUES ($1,$2) ON CONFLICT DO NOTHING`,
        [campaignId, p.id]
      )
    }
    console.log(`  ${camp.name}: ${prods.rows.length} products (paused=${camp.is_paused})`)
  }
}

async function seedQuoteRequests(adminId) {
  console.log('Seeding public quote requests…')
  // Wipe previous demo QR rows by email domain
  await pg.query(
    `DELETE FROM public.quote_requests
      WHERE client_email LIKE '%@demo-trade.example'
         OR client_email LIKE '%@example-builders.co.uk'
         OR notes LIKE 'DEMO_SEED%'`
  )

  const products = await pg.query(
    `SELECT id, code, name, unit, default_price, category
       FROM public.products
      WHERE is_active AND coalesce(is_temporary,false)=false AND deleted_at IS NULL
        AND coalesce(default_price,0) > 0
      ORDER BY random()
      LIMIT 80`
  )
  const pool = products.rows
  if (!pool.length) {
    console.warn('  no products for quote lines')
    return
  }

  const samples = [
    {
      status: 'pending',
      kind: 'quote',
      name: 'Marcus Hale',
      email: 'marcus.hale@example-builders.co.uk',
      company: 'Hale Building Co',
      daysAgo: 1,
      notes: 'DEMO_SEED Need price on cavity pack for new-build plot 4.',
    },
    {
      status: 'pending',
      kind: 'order',
      name: 'Priya Shah',
      email: 'priya.shah@example-builders.co.uk',
      company: 'Shah Developments',
      daysAgo: 0,
      notes: 'DEMO_SEED Ready to order if you can deliver tomorrow AM.',
    },
    {
      status: 'reviewed',
      kind: 'quote',
      name: 'Owen Briggs',
      email: 'owen.briggs@example-builders.co.uk',
      company: 'Briggs Roofing',
      daysAgo: 3,
      notes: 'DEMO_SEED Reviewed – waiting on client go-ahead.',
    },
    {
      status: 'reviewed',
      kind: 'quote',
      name: 'Amelia Croft',
      email: 'amelia.croft@example-builders.co.uk',
      company: 'Croft Interiors',
      daysAgo: 5,
      notes: 'DEMO_SEED Prices filled in admin review.',
    },
    {
      status: 'invoiced',
      kind: 'order',
      name: 'Tom Reed',
      email: 'tom.reed@example-builders.co.uk',
      company: 'Reed Groundworks',
      daysAgo: 8,
      notes: 'DEMO_SEED Converted to invoice for collection.',
    },
    {
      status: 'invoiced',
      kind: 'quote',
      name: 'Nina Patel',
      email: 'nina.patel@example-builders.co.uk',
      company: 'Patel Extensions',
      daysAgo: 12,
      notes: 'DEMO_SEED Quote accepted and invoiced.',
    },
    {
      status: 'rejected',
      kind: 'quote',
      name: 'Chris Doyle',
      email: 'chris.doyle@example-builders.co.uk',
      company: 'Doyle DIY',
      daysAgo: 10,
      notes: 'DEMO_SEED Outside delivery area – rejected.',
    },
    {
      status: 'pending',
      kind: 'quote',
      name: 'Sophie Lang',
      email: 'sophie.lang@example-builders.co.uk',
      company: 'Lang & Sons',
      daysAgo: 2,
      notes: 'DEMO_SEED Mix of timber and fixings for loft conversion.',
    },
    {
      status: 'pending',
      kind: 'order',
      name: 'Harry Quinn',
      email: 'harry.quinn@example-builders.co.uk',
      company: 'Quinn Electrical Trade',
      daysAgo: 1,
      notes: 'DEMO_SEED Online order – all lines priced.',
    },
    {
      status: 'reviewed',
      kind: 'order',
      name: 'Beth Morgan',
      email: 'beth.morgan@example-builders.co.uk',
      company: 'Morgan Plumbing',
      daysAgo: 4,
      notes: 'DEMO_SEED Called customer – confirm payment on collection.',
    },
  ]

  // Find invoices to attach for invoiced status
  const invRes = await pg.query(
    `SELECT id FROM public.invoices
      WHERE type = 'invoice' AND status IN ('sent','partial','paid')
      ORDER BY issue_date DESC
      LIMIT 20`
  )
  const invoiceIds = invRes.rows.map((r) => r.id)

  let qrSeq = 1000
  let orSeq = 1000
  let created = 0

  for (const s of samples) {
    const prefix = s.kind === 'order' ? 'OR' : 'QR'
    const seq = s.kind === 'order' ? ++orSeq : ++qrSeq
    const year = new Date().getUTCFullYear()
    const requestNumber = `${prefix}-${year}-D${seq}`
    const createdAt = daysAgo(s.daysAgo)
    const qrId = randomUUID()
    let createdInvoiceId = null
    if (s.status === 'invoiced' && invoiceIds.length) {
      createdInvoiceId = invoiceIds[created % invoiceIds.length]
    }

    await pg.query(
      `INSERT INTO public.quote_requests (
         id, request_number, client_name, client_email, client_phone, client_company,
         delivery_address_line_1, delivery_town, delivery_county, delivery_postcode,
         notes, kind, status, ip_address, user_agent,
         processed_by, processed_at, created_invoice_id, created_at, updated_at
       ) VALUES (
         $1,$2,$3,$4,$5,$6,
         $7,$8,$9,$10,
         $11,$12,$13,'127.0.0.1'::inet,'DemoSeed/1.0',
         $14,$15,$16,$17,$17
       )`,
      [
        qrId,
        requestNumber,
        s.name,
        s.email,
        '07' + String(700000000 + Math.floor(Math.random() * 99999999)).slice(0, 9),
        s.company,
        `${10 + (created % 40)} Trade Yard`,
        'Slough',
        'Berkshire',
        'SL1 1AA',
        s.notes,
        s.kind,
        s.status,
        s.status === 'pending' ? null : adminId,
        s.status === 'pending' ? null : createdAt.toISOString(),
        createdInvoiceId,
        createdAt.toISOString(),
      ]
    )

    const lineCount = 2 + (created % 4)
    for (let i = 0; i < lineCount; i++) {
      const p = pool[(created * 3 + i) % pool.length]
      const qty = 1 + ((created + i) % 20)
      await pg.query(
        `INSERT INTO public.quote_request_items (
           quote_request_id, product_id, product_code, product_name,
           quantity, unit, suggested_price, notes
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          qrId,
          p.id,
          p.code,
          p.name,
          qty,
          p.unit || 'EA',
          s.kind === 'order' || s.status !== 'pending' ? Number(p.default_price) : Number(p.default_price),
          null,
        ]
      )
    }
    created++
  }
  console.log(`  quote requests: ${created}`)
}

async function seedPickerAndDriverWork(pickerId, driverId) {
  console.log('Preparing picker queue + driver loads…')

  // Reset a batch of recent paid invoices into open picking work
  // Pick invoices that have items and delivery method
  const candidates = await pg.query(
    `SELECT i.id, i.document_number
       FROM public.invoices i
      WHERE i.type = 'invoice'
        AND i.status IN ('sent', 'partial', 'paid')
        AND EXISTS (SELECT 1 FROM public.invoice_items ii WHERE ii.invoice_id = i.id)
      ORDER BY i.issue_date DESC
      LIMIT 40`
  )

  if (!candidates.rows.length) {
    console.warn('  no invoices for picker/driver')
    return { pickerCount: 0, driverLoads: 0 }
  }

  // First 20 → open picker queue (sent/partial, not delivered)
  const pickerBatch = candidates.rows.slice(0, 20)
  for (const inv of pickerBatch) {
    await pg.query(
      `UPDATE public.invoices
          SET status = CASE WHEN status = 'paid' THEN 'sent' ELSE status END,
              picking_status = CASE
                WHEN random() < 0.4 THEN 'in_progress'
                WHEN random() < 0.7 THEN 'not_started'
                ELSE 'loaded'
              END,
              picking_started_at = CASE WHEN random() < 0.5 THEN now() - interval '2 hours' ELSE NULL END,
              delivery_method = 'delivery',
              delivery_address_line_1 = COALESCE(delivery_address_line_1, '12 Trade Park'),
              delivery_town = COALESCE(delivery_town, 'Slough'),
              delivery_postcode = COALESCE(delivery_postcode, 'SL1 1AA')
        WHERE id = $1`,
      [inv.id]
    )
  }

  // Force a clean set of pure not_started for reliable queue
  const pure = pickerBatch.slice(0, 12)
  for (const inv of pure) {
    await pg.query(
      `UPDATE public.invoices
          SET status = 'sent',
              amount_paid = 0,
              picking_status = 'not_started',
              picking_started_at = NULL,
              picking_loaded_at = NULL,
              picking_completed_at = NULL,
              picking_delivered_at = NULL
        WHERE id = $1`,
      [inv.id]
    )
  }

  // Clear existing demo loads on these invoices
  const allIds = candidates.rows.map((r) => r.id)
  await pg.query(`DELETE FROM public.delivery_loads WHERE invoice_id = ANY($1::uuid[])`, [allIds])

  // Create printed loads assigned to driver for last 10 candidates
  const driverBatch = candidates.rows.slice(20, 32)
  // if not enough, reuse earlier ones with different load
  const loadSource =
    driverBatch.length >= 6 ? driverBatch : candidates.rows.slice(12, 24)

  let driverLoads = 0
  for (const inv of loadSource) {
    // Ensure invoice is loaded but not delivered (driver queue filters printed + not delivered)
    await pg.query(
      `UPDATE public.invoices
          SET status = 'sent',
              picking_status = 'loaded',
              picking_loaded_at = now() - interval '1 hour',
              delivery_method = 'delivery',
              delivery_address_line_1 = COALESCE(delivery_address_line_1, 'Unit 4 Builders Way'),
              delivery_town = COALESCE(delivery_town, 'Reading'),
              delivery_county = COALESCE(delivery_county, 'Berkshire'),
              delivery_postcode = COALESCE(delivery_postcode, 'RG1 1AA')
        WHERE id = $1`,
      [inv.id]
    )

    const items = await pg.query(
      `SELECT id, quantity FROM public.invoice_items WHERE invoice_id = $1 ORDER BY sort_order NULLS LAST LIMIT 12`,
      [inv.id]
    )
    if (!items.rows.length) continue

    const loadId = randomUUID()
    await pg.query(
      `INSERT INTO public.delivery_loads (
         id, invoice_id, load_number, status, picked_by,
         printed_at, assigned_driver_id, assigned_at
       ) VALUES ($1,$2,1,'printed',$3, now() - interval '30 minutes', $4, now() - interval '20 minutes')`,
      [loadId, inv.id, pickerId, driverId]
    )

    for (const it of items.rows) {
      await pg.query(
        `INSERT INTO public.delivery_load_items (load_id, invoice_item_id, quantity, status)
         VALUES ($1,$2,$3,'loaded')
         ON CONFLICT DO NOTHING`,
        [loadId, it.id, it.quantity]
      )
    }
    driverLoads++
  }

  // Also leave a few open loads for picker mid-pick demo
  const openPick = pure.slice(0, 3)
  for (const inv of openPick) {
    const items = await pg.query(
      `SELECT id, quantity FROM public.invoice_items WHERE invoice_id = $1 LIMIT 4`,
      [inv.id]
    )
    if (!items.rows.length) continue
    const loadId = randomUUID()
    await pg.query(
      `INSERT INTO public.delivery_loads (
         id, invoice_id, load_number, status, picked_by
       ) VALUES ($1,$2,1,'open',$3)`,
      [loadId, inv.id, pickerId]
    )
    // only partial lines so invoice still stays in picker queue
    for (const it of items.rows.slice(0, 1)) {
      await pg.query(
        `INSERT INTO public.delivery_load_items (load_id, invoice_item_id, quantity, status)
         VALUES ($1,$2,$3,'loaded') ON CONFLICT DO NOTHING`,
        [loadId, it.id, Math.max(0.1, Number(it.quantity) * 0.3)]
      )
    }
    await pg.query(
      `UPDATE public.invoices SET picking_status = 'in_progress', picking_started_at = now() WHERE id = $1`,
      [inv.id]
    )
  }

  const pickerCount = await pg.query(
    `SELECT count(*)::int AS n FROM public.invoices
      WHERE type = 'invoice'
        AND status IN ('sent','partial')
        AND coalesce(picking_status,'not_started') NOT IN ('completed','delivered')
        AND deleted_at IS NULL`
  )

  console.log(
    `  picker-open invoices ≈ ${pickerCount.rows[0].n}, driver printed loads: ${driverLoads}`
  )
  return { pickerCount: pickerCount.rows[0].n, driverLoads }
}

function writeCredentialsDoc({
  staff,
  clientSamples,
  stats,
}) {
  const path = join(root, 'DEMO_CREDENTIALS.md')
  const lines = [
    '# Demo Builder Merchant – credentials & demo data',
    '',
    '> Local demo only. Prefer keeping this file gitignored. Safe to share with internal sales demos.',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    '## Staff logins',
    '',
    'Sign in at **`/admin-login`** (picker/driver may also use role-specific entry points `/picker` and `/driver` after auth).',
    '',
    '| Role | Email | Password | Path to show |',
    '|------|-------|----------|--------------|',
    `| **Admin** | \`${staff.admin}\` | \`${STAFF_PASSWORD}\` | \`/dashboard\` Analytics, products, campaigns, quotes |`,
    `| **Picker** | \`${staff.picker}\` | \`${STAFF_PASSWORD}\` | \`/picker\` pick queue |`,
    `| **Driver** | \`${staff.driver}\` | \`${STAFF_PASSWORD}\` | \`/driver\` delivery jobs |`,
    `| Admin (legacy) | \`dhotgta@gmail.com\` | \`${STAFF_PASSWORD}\` | same as admin |`,
    '',
    '## Client portal logins',
    '',
    'Sign in at **`/login`**. Password for every demo portal client:',
    '',
    '```',
    CLIENT_PASSWORD,
    '```',
    '',
    'Sample client emails (all use the password above):',
    '',
    ...clientSamples.map((e) => `- \`${e}\``),
    '',
    'Pattern: `{first}.{last}.{n}@demo-trade.example`',
    '',
    '## What is seeded for demos',
    '',
    '| Area | Detail |',
    '|------|--------|',
    `| Products | ${stats.products} active (incl. temporary walk-in lines) |`,
    `| Temporary products | ${stats.tempProducts} (\`TEMP-*\` codes, is_temporary) |`,
    `| Campaigns | ${stats.campaigns} (Summer live, Winter scheduled, Spring paused) |`,
    `| Clients | ${stats.clients} |`,
    `| Invoices | ${stats.invoices} |`,
    `| Quotations (docs) | ${stats.quotations} |`,
    `| Quote requests (inbox) | ${stats.quoteRequests} pending/reviewed/invoiced/rejected mix |`,
    `| Payments | ${stats.payments} |`,
    `| Picker-open jobs | ~${stats.pickerOpen} invoices |`,
    `| Driver printed loads | ${stats.driverLoads} |`,
    '',
    '## Suggested demo path',
    '',
    '1. **Admin** → Analytics (seasonality) → Campaigns (Summer Trade Sale) → Products (filter temporary) → Quote requests inbox.',
    '2. **Picker** → open queue, start a pick.',
    '3. **Driver** → see printed loads assigned for delivery.',
    '4. **Client portal** → login as a trade client, view invoices.',
    '',
    '## Reseed commands',
    '',
    '```bash',
    'DEMO_SEED_CONFIRM=yes npm run seed:demo:catalog',
    'DEMO_SEED_CONFIRM=yes node scripts/seed-demo-history.mjs --clients 100 --months 48 --wipe-first',
    'node scripts/seed-portal-accounts.mjs',
    'DEMO_SEED_CONFIRM=yes node scripts/seed-demo-extras.mjs',
    '```',
    '',
  ]
  writeFileSync(path, lines.join('\n'), 'utf8')
  console.log(`Wrote ${path}`)
  return path
}

async function main() {
  console.log('=== Demo extras seed ===')
  await pg.connect()

  try {
    await ensureDeliveryTables()

    console.log('Staff accounts…')
    const ids = {}
    for (const s of STAFF) {
      const id = await ensureStaffUser(s)
      ids[s.role === 'admin' && !ids.admin ? 'admin' : s.role] = ids[s.role] || id
      if (s.email === 'admin@demo-builder.com') ids.admin = id
      if (s.email === 'picker@demo-builder.com') ids.picker = id
      if (s.email === 'driver@demo-builder.com') ids.driver = id
    }

    if (!ids.admin) {
      const r = await pg.query(
        `SELECT id FROM profiles WHERE role = 'admin' AND is_active ORDER BY created_at LIMIT 1`
      )
      ids.admin = r.rows[0]?.id
    }
    if (!ids.picker || !ids.driver) {
      throw new Error('picker/driver ids missing after staff seed')
    }

    await seedTempProducts()
    await seedCampaigns()
    await seedQuoteRequests(ids.admin)
    const work = await seedPickerAndDriverWork(ids.picker, ids.driver)

    // Stats for credentials doc
    const statsQ = await pg.query(`
      SELECT
        (SELECT count(*)::int FROM products WHERE is_active AND deleted_at IS NULL) AS products,
        (SELECT count(*)::int FROM products WHERE coalesce(is_temporary,false)) AS temp_products,
        (SELECT count(*)::int FROM campaigns WHERE deleted_at IS NULL) AS campaigns,
        (SELECT count(*)::int FROM clients) AS clients,
        (SELECT count(*)::int FROM invoices WHERE type = 'invoice') AS invoices,
        (SELECT count(*)::int FROM invoices WHERE type = 'quotation') AS quotations,
        (SELECT count(*)::int FROM quote_requests) AS quote_requests,
        (SELECT count(*)::int FROM payments) AS payments
    `)
    const s = statsQ.rows[0]

    const clients = await pg.query(
      `SELECT email FROM clients WHERE email IS NOT NULL ORDER BY created_at LIMIT 8`
    )

    writeCredentialsDoc({
      staff: {
        admin: 'admin@demo-builder.com',
        picker: 'picker@demo-builder.com',
        driver: 'driver@demo-builder.com',
      },
      clientSamples: clients.rows.map((r) => r.email),
      stats: {
        products: s.products,
        tempProducts: s.temp_products,
        campaigns: s.campaigns,
        clients: s.clients,
        invoices: s.invoices,
        quotations: s.quotations,
        quoteRequests: s.quote_requests,
        payments: s.payments,
        pickerOpen: work.pickerCount,
        driverLoads: work.driverLoads,
      },
    })

    console.log('=== Demo extras complete ===')
    console.log({
      admin: 'admin@demo-builder.com',
      picker: 'picker@demo-builder.com',
      driver: 'driver@demo-builder.com',
      password: STAFF_PASSWORD,
      quote_requests: s.quote_requests,
      campaigns: s.campaigns,
      temp_products: s.temp_products,
      driver_loads: work.driverLoads,
    })
  } catch (err) {
    console.error('Extras seed failed:', err.message)
    console.error(err.stack)
    process.exitCode = 1
  } finally {
    await pg.end()
  }
}

main()
