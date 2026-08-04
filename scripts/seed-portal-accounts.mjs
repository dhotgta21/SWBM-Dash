// Create client portal auth users via service role (correct GoTrue rows)
// and link profiles.role = client.
//
//   node scripts/seed-portal-accounts.mjs
// Password for every portal user: DemoClient1!

import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'

function loadEnv(p) {
  if (!existsSync(p)) return
  for (const raw of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const i = line.indexOf('=')
    if (i < 1) continue
    let v = line.slice(i + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1)
    }
    process.env[line.slice(0, i).trim()] = v
  }
}
loadEnv(resolve('.env'))
loadEnv(resolve('.env.local'))

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const service = process.env.SUPABASE_SERVICE_ROLE_KEY
const PASSWORD = 'DemoClient1!'
const LIMIT = Number(process.env.PORTAL_SEED_LIMIT || 50)

const admin = createClient(url, service, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const { data: clients, error: cErr } = await admin
  .from('clients')
  .select('id, email, first_name, last_name, company_name')
  .not('email', 'is', null)
  .order('created_at', { ascending: true })
  .limit(LIMIT)

if (cErr) {
  console.error('clients query failed', cErr)
  process.exit(1)
}

let created = 0
let linked = 0
let skipped = 0
let failed = 0

const listed = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
if (listed.error) {
  console.error('listUsers failed', listed.error)
  process.exit(1)
}
const usersByEmail = new Map(
  (listed.data.users || []).map((u) => [(u.email || '').toLowerCase(), u])
)

for (const c of clients || []) {
  const email = (c.email || '').trim().toLowerCase()
  if (!email) {
    skipped++
    continue
  }
  const fullName =
    [c.first_name, c.last_name].filter(Boolean).join(' ').trim() ||
    c.company_name ||
    email.split('@')[0]

  // Already linked?
  const { data: existingProf } = await admin
    .from('profiles')
    .select('id, role, client_id')
    .eq('client_id', c.id)
    .eq('role', 'client')
    .maybeSingle()
  if (existingProf) {
    skipped++
    continue
  }

  // Find or create auth user
  let userId = null
  const found = usersByEmail.get(email)
  if (found) {
    userId = found.id
    await admin.auth.admin.updateUserById(userId, {
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: fullName, demo_portal: true },
    })
  } else {
    const { data: createdUser, error: createErr } = await admin.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: fullName, demo_portal: true },
    })
    if (createErr || !createdUser.user) {
      console.warn('create failed', email, createErr?.message)
      failed++
      continue
    }
    userId = createdUser.user.id
    usersByEmail.set(email, createdUser.user)
    created++
  }

  // Profile → client
  const { error: upErr } = await admin.from('profiles').upsert(
    {
      id: userId,
      email,
      full_name: fullName,
      role: 'client',
      client_id: c.id,
      is_active: true,
      failed_sign_in_attempts: 0,
      locked_until: null,
      created_by: userId,
    },
    { onConflict: 'id' }
  )
  if (upErr) {
    console.warn('profile link failed', email, upErr.message)
    failed++
    continue
  }
  linked++
  if ((created + linked) % 10 === 0) {
    console.log(`progress created=${created} linked=${linked} skipped=${skipped} failed=${failed}`)
  }
}

console.log({ created, linked, skipped, failed, password: PASSWORD })
const { count } = await admin
  .from('profiles')
  .select('*', { count: 'exact', head: true })
  .eq('role', 'client')
console.log('client portal profiles now:', count)
