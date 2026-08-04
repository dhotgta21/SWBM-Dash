import { readFileSync, existsSync } from 'fs'
import { createClient } from '@supabase/supabase-js'

function load(p) {
  if (!existsSync(p)) return
  for (const raw of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const l = raw.trim()
    if (!l || l.startsWith('#')) continue
    const i = l.indexOf('=')
    if (i < 1) continue
    let v = l.slice(i + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1)
    }
    process.env[l.slice(0, i).trim()] = v
  }
}
load('.env')
load('.env.local')

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const service = process.env.SUPABASE_SERVICE_ROLE_KEY
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
const email = process.argv[2] || 'dhotgta@gmail.com'
const password = process.argv[3] || 'A1b2c3d4@'

const admin = createClient(url, service, {
  auth: { persistSession: false, autoRefreshToken: false },
})

let found = null
for (let page = 1; page <= 10; page++) {
  const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 100 })
  if (error) {
    console.log('listUsers FAIL', error.message)
    break
  }
  found = data.users.find((u) => (u.email || '').toLowerCase() === email.toLowerCase()) || null
  if (found || !data.users.length) break
}

console.log('auth user:', found ? `${found.id} ${found.email}` : 'MISSING')

if (!found) {
  console.log('Creating admin via service role...')
  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: 'Demo Admin', demo_admin: true },
  })
  if (error) {
    console.log('create FAIL', error.message)
    process.exit(1)
  }
  found = created.user
  console.log('created', found.id)
} else {
  const { error } = await admin.auth.admin.updateUserById(found.id, {
    password,
    email_confirm: true,
    user_metadata: { full_name: 'Demo Admin', demo_admin: true },
  })
  console.log('password set:', error ? error.message : 'ok')
}

await admin.from('profiles').upsert(
  {
    id: found.id,
    email,
    full_name: 'Demo Admin',
    role: 'admin',
    is_active: true,
    client_id: null,
    failed_sign_in_attempts: 0,
    locked_until: null,
    created_by: found.id,
  },
  { onConflict: 'id' }
)

const { data: prof } = await admin
  .from('profiles')
  .select('email, role, is_active')
  .eq('id', found.id)
  .maybeSingle()
console.log('profile:', prof)

const pub = createClient(url, anon, {
  auth: { persistSession: false, autoRefreshToken: false },
})
const { data: si, error: se } = await pub.auth.signInWithPassword({ email, password })
if (se) {
  console.log('LOGIN FAIL:', se.message, se.code || '', se.status || '')
  process.exit(1)
}
console.log('LOGIN OK as', si.user.email)

const { count } = await pub
  .from('products')
  .select('id', { count: 'exact', head: true })
  .eq('is_active', true)
console.log('PUBLIC products:', count)
console.log('YES — you can log in with', email, '/', password)
