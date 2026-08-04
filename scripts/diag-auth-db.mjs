import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import pg from 'pg'
import { createClient } from '@supabase/supabase-js'

function loadEnv(path) {
  if (!existsSync(path)) return
  for (const raw of readFileSync(path, 'utf8').split(/\r?\n/)) {
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

const raw =
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_PRISMA_URL
if (!raw) {
  console.error('No POSTGRES_URL*')
  process.exit(1)
}
const clean = raw
  .replace(/([?&])sslmode=[^&]*/g, '$1')
  .replace(/\?&/, '?')
  .replace(/\?$/, '')

const client = new pg.Client({ connectionString: clean, ssl: { rejectUnauthorized: false } })
await client.connect()
console.log('PG connected')

try {
  const users = await client.query(`
    SELECT id, email,
           email_confirmed_at IS NOT NULL AS confirmed,
           encrypted_password IS NOT NULL AS has_pw,
           length(coalesce(encrypted_password,'')) AS pw_len,
           banned_until, deleted_at, is_sso_user, is_anonymous,
           confirmation_token IS NOT NULL AS has_confirm_tok,
           recovery_token IS NOT NULL AS has_recovery_tok,
           email_change_token_new IS NOT NULL AS has_email_change,
           raw_app_meta_data, raw_user_meta_data
    FROM auth.users
    ORDER BY created_at
  `)
  console.log('auth.users', users.rows.length)
  for (const u of users.rows) {
    console.log({
      id: u.id,
      email: u.email,
      confirmed: u.confirmed,
      has_pw: u.has_pw,
      pw_len: u.pw_len,
      banned_until: u.banned_until,
      deleted_at: u.deleted_at,
      is_anonymous: u.is_anonymous,
      app: u.raw_app_meta_data,
    })
  }

  const ids = await client.query(
    `SELECT id, user_id, provider, provider_id, identity_data FROM auth.identities`
  )
  console.log('identities', ids.rows.length, ids.rows.map((r) => ({
    user_id: r.user_id,
    provider: r.provider,
    provider_id: r.provider_id,
  })))

  // Common breakage: empty string tokens vs null (GoTrue expects '')
  const badTokens = await client.query(`
    SELECT email,
           confirmation_token, recovery_token,
           email_change_token_new, email_change_token_current,
           reauthentication_token
    FROM auth.users
  `)
  for (const r of badTokens.rows) {
    const fields = [
      'confirmation_token',
      'recovery_token',
      'email_change_token_new',
      'email_change_token_current',
      'reauthentication_token',
    ]
    const issues = []
    for (const f of fields) {
      if (r[f] === null) issues.push(`${f}=NULL`)
    }
    if (issues.length) console.log('token nulls for', r.email, issues.join(', '))
  }

  // Fix NULL token columns to empty string (known GoTrue issue)
  console.log('--- applying token null -> empty string fix ---')
  const fix = await client.query(`
    UPDATE auth.users SET
      confirmation_token = COALESCE(confirmation_token, ''),
      recovery_token = COALESCE(recovery_token, ''),
      email_change_token_new = COALESCE(email_change_token_new, ''),
      email_change_token_current = COALESCE(email_change_token_current, ''),
      reauthentication_token = COALESCE(reauthentication_token, '')
    WHERE confirmation_token IS NULL
       OR recovery_token IS NULL
       OR email_change_token_new IS NULL
       OR email_change_token_current IS NULL
       OR reauthentication_token IS NULL
  `)
  console.log('rows fixed', fix.rowCount)

  // Ensure password is bcrypt for demo user
  const pw = await client.query(
    `
    UPDATE auth.users
       SET encrypted_password = crypt($2, gen_salt('bf')),
           email_confirmed_at = COALESCE(email_confirmed_at, now()),
           updated_at = now()
     WHERE lower(email) = lower($1)
     RETURNING id, email
  `,
    ['dhotgta@gmail.com', 'A1b2c3d4@']
  )
  console.log('password reset rows', pw.rows)

  // Ensure identity exists
  const urow = (
    await client.query(`SELECT id FROM auth.users WHERE lower(email)=lower($1)`, [
      'dhotgta@gmail.com',
    ])
  ).rows[0]
  if (urow) {
    const idExists = await client.query(
      `SELECT 1 FROM auth.identities WHERE user_id=$1 AND provider='email'`,
      [urow.id]
    )
    if (idExists.rowCount === 0) {
      await client.query(
        `
        INSERT INTO auth.identities (
          id, user_id, identity_data, provider, provider_id,
          last_sign_in_at, created_at, updated_at
        ) VALUES (
          gen_random_uuid(), $1,
          jsonb_build_object('sub', $1::text, 'email', $2, 'email_verified', true),
          'email', $1::text, now(), now(), now()
        )
      `,
        [urow.id, 'dhotgta@gmail.com']
      )
      console.log('created missing email identity')
    } else {
      console.log('email identity ok')
    }
  }
} catch (e) {
  console.error('PG error', e.message)
  process.exitCode = 1
} finally {
  await client.end()
}

// Re-test Auth API
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const service = process.env.SUPABASE_SERVICE_ROLE_KEY
const anon =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

console.log('--- retest Auth API ---')
const admin = createClient(url, service, {
  auth: { persistSession: false, autoRefreshToken: false },
})
const listed = await admin.auth.admin.listUsers({ page: 1, perPage: 5 })
console.log('listUsers', listed.error?.message || 'ok', listed.data?.users?.map((u) => u.email))

const pub = createClient(url, anon, {
  auth: { persistSession: false, autoRefreshToken: false },
})
const si = await pub.auth.signInWithPassword({
  email: 'dhotgta@gmail.com',
  password: 'A1b2c3d4@',
})
console.log(
  'signInWithPassword',
  si.error ? `${si.error.message} code=${si.error.code} status=${si.error.status}` : `ok ${si.data.user?.email}`
)

const res = await fetch(`${url}/auth/v1/admin/users?page=1&per_page=2`, {
  headers: { apikey: service, Authorization: `Bearer ${service}` },
})
console.log('raw status', res.status, (await res.text()).slice(0, 300))
