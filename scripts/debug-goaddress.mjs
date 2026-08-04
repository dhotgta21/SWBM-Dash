import { createClient } from '@supabase/supabase-js'
import { createDecipheriv, scryptSync } from 'crypto'
import fs from 'fs'

function loadEnv(path) {
  const out = {}
  for (const line of fs.readFileSync(path, 'utf8').split(/\r?\n/)) {
    if (!line || line.startsWith('#') || !line.includes('=')) continue
    const i = line.indexOf('=')
    const k = line.slice(0, i).trim()
    let v = line.slice(i + 1).trim()
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1)
    }
    out[k] = v
  }
  return out
}

const env = loadEnv('.env.local')
const url = env.NEXT_PUBLIC_SUPABASE_URL
const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY

console.log('has ENCRYPTION_KEY', Boolean(env.ENCRYPTION_KEY))
console.log('has AI_DESIGNER_KEY_ENCRYPTION_KEY', Boolean(env.AI_DESIGNER_KEY_ENCRYPTION_KEY))
console.log(
  'GOADDRESS_TOKEN env',
  env.GOADDRESS_TOKEN
    ? `len=${env.GOADDRESS_TOKEN.length} placeholder=${/replace|your.?token|\.\.\./i.test(env.GOADDRESS_TOKEN)}`
    : 'missing'
)

if (!url || !key) {
  console.log('missing supabase admin credentials')
  process.exit(0)
}

const admin = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const { data, error } = await admin
  .from('company_integration_secrets')
  .select('goaddress_token_encrypted, goaddress_token_updated_at')
  .eq('id', 1)
  .maybeSingle()

if (error) {
  console.log('db error', error.message)
  process.exit(0)
}

const enc = data?.goaddress_token_encrypted
console.log('has_row', Boolean(data))
console.log('has_encrypted', Boolean(enc))
console.log('enc_parts', enc ? enc.split(':').length : 0)
console.log('enc_len', enc ? enc.length : 0)
console.log('updated_at', data?.goaddress_token_updated_at ?? null)

const password = env.ENCRYPTION_KEY || env.AI_DESIGNER_KEY_ENCRYPTION_KEY
if (enc && password) {
  try {
    const [saltB64, ivB64, authTagB64, encryptedB64] = enc.split(':')
    const salt = Buffer.from(saltB64, 'base64url')
    const iv = Buffer.from(ivB64, 'base64url')
    const authTag = Buffer.from(authTagB64, 'base64url')
    const encrypted = Buffer.from(encryptedB64, 'base64url')
    const keybuf = scryptSync(Buffer.from(password, 'utf8'), salt, 32)
    const decipher = createDecipheriv('aes-256-gcm', keybuf, iv)
    decipher.setAuthTag(authTag)
    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]).toString('utf8')
    console.log('decrypt_ok', true, 'token_len', decrypted.length)

    const headers = {
      Authorization: `Bearer ${decrypted}`,
      Accept: 'application/json',
    }
    for (const pc of ['HA37HZ', 'N33RP', 'SL11AA']) {
      const res = await fetch(`https://portal.goaddress.io/api/address/${pc}`, {
        headers,
      })
      const text = await res.text()
      let body
      try {
        body = JSON.parse(text)
      } catch {
        body = { raw: text.slice(0, 200) }
      }
      console.log(
        'api',
        pc,
        res.status,
        'count',
        body.count,
        'new_res',
        Array.isArray(body.new_address_res) ? body.new_address_res.length : null,
        'results',
        Array.isArray(body.results) ? body.results.length : null,
        'msg',
        body.message || null,
        'remaining',
        body.remaining_today ?? null
      )
      if (res.ok && body.new_address_res?.[0]) {
        console.log('sample keys', Object.keys(body.new_address_res[0]).join(','))
        console.log('sample raw', body.new_address_res[0].raw_address)
      }
      if (res.ok && body.results?.[0]) {
        console.log('results0 type', typeof body.results[0], body.results[0])
      }
    }
  } catch (e) {
    console.log('decrypt_ok', false, 'err', e instanceof Error ? e.message : e)
  }
} else if (enc && !password) {
  console.log('cannot decrypt: ENCRYPTION_KEY missing in .env.local')
} else {
  console.log('no encrypted token in DB')
}
