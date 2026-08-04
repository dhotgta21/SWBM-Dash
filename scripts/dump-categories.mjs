// Quick script to dump category -> image map from Supabase REST API
import * as fs from 'fs'

const envFile = fs.readFileSync('.env.local', 'utf8')
const env = {}
for (const line of envFile.split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)\s*=\s*"?([^"\n]+)"?\s*$/)
  if (m) env[m[1]] = m[2].trim()
}

const url = env.NEXT_PUBLIC_SUPABASE_URL
const key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
if (!url || !key) {
  console.error('Missing Supabase env vars')
  process.exit(1)
}

// Query Supabase REST API directly (avoids realtime WebSocket dep on Node 20)
const qs = 'select=category,image_url&is_active=eq.true&category=not.is.null&limit=1000'
const apiUrl = `${url}/rest/v1/products?${qs}`
const res = await fetch(apiUrl, {
  headers: {
    apikey: key,
    Authorization: `Bearer ${key}`,
  },
})
if (!res.ok) {
  console.error('REST error:', res.status, await res.text())
  process.exit(1)
}
const data = await res.json()

const map = new Map()
for (const r of data) {
  if (!r.category) continue
  const cur = map.get(r.category) || { count: 0, image: null }
  cur.count += 1
  if (!cur.image && r.image_url) cur.image = r.image_url
  map.set(r.category, cur)
}

const sorted = Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]))
const out = sorted.map(([name, info]) => ({ name, count: info.count, image: info.image }))
console.log(JSON.stringify(out, null, 2))