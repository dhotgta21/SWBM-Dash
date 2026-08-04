import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const email = process.argv[2]

if (!url || !serviceRoleKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars')
  process.exit(1)
}

if (!email) {
  console.error('Usage: node scripts/reactivate-account.mjs <email>')
  process.exit(1)
}

const supabase = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const { data: profile, error } = await supabase
  .from('profiles')
  .select('id, email, role, is_active, locked_until, failed_sign_in_attempts')
  .eq('email', email)
  .maybeSingle()

if (error) {
  console.error('Database error:', error)
  process.exit(1)
}

if (!profile) {
  console.error(`No profile found for ${email}`)
  process.exit(1)
}

console.log('Current profile state:')
console.log(JSON.stringify(profile, null, 2))

if (profile.is_active === false) {
  const { error: updateError } = await supabase
    .from('profiles')
    .update({ is_active: true, locked_until: null, failed_sign_in_attempts: 0 })
    .eq('id', profile.id)

  if (updateError) {
    console.error('Failed to reactivate:', updateError)
    process.exit(1)
  }

  console.log('\nAccount reactivated successfully.')
} else {
  console.log('\nAccount is already active; no change made.')
}
