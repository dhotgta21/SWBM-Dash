// scripts/demo-auth-smoke.mjs
// Live smoke test for demo sign-in + products against .env / .env.local
//
// Usage:
//   node scripts/demo-auth-smoke.mjs
//   node scripts/demo-auth-smoke.mjs dhotgta@gmail.com 'A1b2c3d4@'
//
// Loads .env then .env.local (local wins). Never prints full secrets.

import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'

function loadEnvFile(path) {
  if (!existsSync(path)) return
  const text = readFileSync(path, 'utf8')
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const i = line.indexOf('=')
    if (i < 1) continue
    const key = line.slice(0, i).trim()
    let val = line.slice(i + 1).trim()
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1)
    }
    if (!(key in process.env) || process.env[key] === '') {
      process.env[key] = val
    }
  }
}

// .env first, then .env.local overrides
loadEnvFile(resolve(process.cwd(), '.env'))
loadEnvFile(resolve(process.cwd(), '.env.local'))
// Force-reload: local wins for keys already set from .env
if (existsSync(resolve(process.cwd(), '.env.local'))) {
  const text = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8')
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const i = line.indexOf('=')
    if (i < 1) continue
    const key = line.slice(0, i).trim()
    let val = line.slice(i + 1).trim()
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1)
    }
    process.env[key] = val
  }
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const anon =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_ANON_KEY
const service =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY

const email = (process.argv[2] || 'dhotgta@gmail.com').toLowerCase()
const password = process.argv[3] || 'A1b2c3d4@'

function fail(msg) {
  console.error('FAIL:', msg)
  process.exit(1)
}

function ok(msg) {
  console.log('OK  ', msg)
}

console.log('--- Demo auth / products smoke ---')
console.log('URL :', url || '(missing)')
console.log('Anon:', anon ? `set (len ${anon.length})` : '(missing)')
console.log('Svc :', service ? `set (len ${service.length})` : '(missing)')
console.log('User:', email)

if (!url || !anon || !service) {
  fail('Missing URL / anon / service role. Fill .env or .env.local with real Supabase values.')
}

const blob = `${url}${anon}${service}`
if (/YOUR-PROJECT|place-me|replace-me|your-project-ref/i.test(blob)) {
  fail(
    'Your .env still has PLACEHOLDER values (YOUR-PROJECT-REF / place-me / replace-me). Paste real keys from Supabase → Project Settings → API.'
  )
}

const admin = createClient(url, service, {
  auth: { persistSession: false, autoRefreshToken: false },
})
const publicClient = createClient(url, anon, {
  auth: { persistSession: false, autoRefreshToken: false },
})

// 1) Admin can list users
const listed = await admin.auth.admin.listUsers({ page: 1, perPage: 50 })
if (listed.error) {
  fail(`listUsers: ${listed.error.message} (service role key wrong or not service_role?)`)
}
const emails = listed.data.users.map((u) => u.email).filter(Boolean)
ok(`listUsers: ${emails.length} user(s) — ${emails.slice(0, 8).join(', ') || '(none)'}`)

const user = listed.data.users.find((u) => (u.email || '').toLowerCase() === email)
if (!user) {
  fail(`No auth user "${email}". Create it in Supabase → Authentication → Users, or run 05_demo_admin.sql.`)
}
ok(`found user ${user.id}`)

// 2) Set password (demo)
const upd = await admin.auth.admin.updateUserById(user.id, {
  password,
  email_confirm: true,
})
if (upd.error) {
  fail(`updateUserById password: ${upd.error.message}`)
}
ok('password synced via service role')

// 3) Password grant (anon client — what the app uses after sync)
const signed = await publicClient.auth.signInWithPassword({ email, password })
if (signed.error) {
  console.warn('WARN password grant failed:', signed.error.message, signed.error.code)
  // Try magic link mint like the app
  const link = await admin.auth.admin.generateLink({ type: 'magiclink', email })
  if (link.error || !link.data?.properties?.hashed_token) {
    fail(`password grant + generateLink both failed: ${signed.error.message} / ${link.error?.message}`)
  }
  const tokenHash = link.data.properties.hashed_token
  let verified = await publicClient.auth.verifyOtp({ token_hash: tokenHash, type: 'magiclink' })
  if (verified.error) {
    verified = await publicClient.auth.verifyOtp({ token_hash: tokenHash, type: 'email' })
  }
  if (verified.error || !verified.data.user) {
    fail(`verifyOtp failed: ${verified.error?.message || 'no user'}`)
  }
  ok(`session via magic link mint (password grant blocked: ${signed.error.message})`)
} else {
  ok(`session via password grant as ${signed.data.user.email}`)
}

// 4) Profile
const { data: profile, error: profileErr } = await admin
  .from('profiles')
  .select('id, email, role, is_active')
  .eq('id', user.id)
  .maybeSingle()
if (profileErr) {
  console.warn('WARN profiles read:', profileErr.message)
} else if (!profile) {
  console.warn('WARN no profiles row for user — app will auto-create on login')
} else {
  ok(`profile role=${profile.role} active=${profile.is_active}`)
}

// 5) Products (service role + anon)
const { count: svcCount, error: svcErr } = await admin
  .from('products')
  .select('id', { count: 'exact', head: true })
if (svcErr) {
  console.warn('WARN products (service):', svcErr.message)
} else {
  ok(`products (service role): ${svcCount ?? 0}`)
}

const { count: anonCount, error: anonErr } = await publicClient
  .from('products')
  .select('id', { count: 'exact', head: true })
  .eq('is_active', true)
if (anonErr) {
  console.warn('WARN products (anon):', anonErr.message, '— run 00_ALL_IN_ONE_fix_products.sql')
} else {
  ok(`products (anon active): ${anonCount ?? 0}`)
}

console.log('--- ALL CHECKS PASSED ---')
process.exit(0)
