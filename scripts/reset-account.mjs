#!/usr/bin/env node
// Reset a user's login state without deleting any data.
// Usage: source .env.local && node scripts/reset-account.mjs <email>
import { createClient } from '@supabase/supabase-js'
import readline from 'node:readline/promises'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const email = process.argv[2]

if (!url || !serviceRoleKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars')
  console.error('Run with: source .env.local && node scripts/reset-account.mjs <email>')
  process.exit(1)
}

if (!email) {
  console.error('Usage: source .env.local && node scripts/reset-account.mjs <email>')
  process.exit(1)
}

const supabase = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const rl = readline.createInterface({ input: process.stdin, output: process.stdout })

async function main() {
  // 1. Find auth user
  const { data: list, error: listError } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  })
  if (listError) throw listError

  const authUser = list.users.find(u => u.email?.toLowerCase() === email.toLowerCase())
  if (!authUser) {
    console.error(`No auth user found for ${email}`)
    process.exit(1)
  }

  console.log(`Found auth user: ${authUser.id}`)

  // 2. Show current profile state
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, email, role, is_active, locked_until, failed_sign_in_attempts')
    .eq('id', authUser.id)
    .maybeSingle()

  if (profileError) throw profileError

  if (!profile) {
    console.error('Auth user exists but no profile row found.')
    process.exit(1)
  }

  console.log('Current profile:', JSON.stringify(profile, null, 2))

  // 3. Reactivate + clear lockout
  const { error: updateError } = await supabase
    .from('profiles')
    .update({
      is_active: true,
      locked_until: null,
      failed_sign_in_attempts: 0,
    })
    .eq('id', authUser.id)

  if (updateError) throw updateError

  console.log('Profile reactivated and lockout cleared.')

  // 4. Optionally set a new temporary password
  const answer = await rl.question('Set a temporary password now? (y/N): ')
  if (answer.trim().toLowerCase() === 'y') {
    const newPassword = await rl.question('Enter temporary password (min 6 chars): ')
    if (newPassword.length < 6) {
      console.error('Password too short.')
      process.exit(1)
    }

    const { error: pwdError } = await supabase.auth.admin.updateUserById(authUser.id, {
      password: newPassword,
    })

    if (pwdError) throw pwdError
    console.log('Temporary password set. You can now sign in.')
  } else {
    console.log('No password changed. Use your existing password.')
  }

  rl.close()
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
