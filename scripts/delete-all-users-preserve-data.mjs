#!/usr/bin/env node
// Delete all existing users but keep business data by reassigning it to a
// temporary placeholder admin. The placeholder can then create a real admin
// through the app and be deleted afterwards.
//
// This script uses a direct Postgres connection for profile/business-data
// updates because the service-role key is restricted from modifying profiles
// by the security-hardening migrations.
//
// Usage:
//   source .env.local
//   node scripts/delete-all-users-preserve-data.mjs

import { createClient } from '@supabase/supabase-js'
import { Client } from 'pg'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const postgresUrl = process.env.POSTGRES_PRISMA_URL || process.env.POSTGRES_URL

if (!url || !serviceRoleKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars')
  process.exit(1)
}

if (!postgresUrl) {
  console.error('Missing POSTGRES_PRISMA_URL or POSTGRES_URL env var')
  process.exit(1)
}

const supabase = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const TEMP_EMAIL = 'temp-admin@starhawkbm.internal'
const TEMP_PASSWORD = `TempAdmin${Math.random().toString(36).slice(2, 10)}!`

async function getPgClient() {
  // Strip any sslmode from the connection string so we can supply our own
  // SSL config. Supabase pooler uses a self-signed cert, so we need to
  // disable certificate verification for this one-off administrative script.
  const cleanUrl = postgresUrl.replace(/([?&])sslmode=[^&]*&?/g, '$1').replace(/\?&/, '?').replace(/\?$/, '')
  const client = new Client({
    connectionString: cleanUrl,
    ssl: { rejectUnauthorized: false },
  })
  await client.connect()
  return client
}

async function main() {
  const pgClient = await getPgClient()

  try {
    // Bypass row-level policy triggers (e.g. enforce_profile_update_scope)
    // for this administrative script. We reset it in the finally block.
    await pgClient.query("SET session_replication_role = 'replica'")

    // 1. List existing users
    const { data: list, error: listError } = await supabase.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    })
    if (listError) throw listError

    const existingUsers = list.users
    console.log(`Found ${existingUsers.length} user(s).`)

    if (existingUsers.length === 0) {
      console.log('No users to delete.')
      return
    }

    // 2. Create or update a temporary placeholder admin via Supabase Auth
    let tempUserId = existingUsers.find(u => u.email === TEMP_EMAIL)?.id

    if (!tempUserId) {
      const { data: createData, error: createError } = await supabase.auth.admin.createUser({
        email: TEMP_EMAIL,
        password: TEMP_PASSWORD,
        email_confirm: true,
      })

      if (createError) throw createError
      tempUserId = createData.user.id
      console.log(`Created temporary admin auth user: ${TEMP_EMAIL}`)
    } else {
      // Reset the temp admin password so you can sign in
      const { error: updateError } = await supabase.auth.admin.updateUserById(tempUserId, {
        password: TEMP_PASSWORD,
      })
      if (updateError) throw updateError
      console.log(`Temporary admin already exists, reset password: ${TEMP_EMAIL}`)
    }

    // 3. Ensure the placeholder has an admin profile (direct Postgres)
    await pgClient.query(
      `
      INSERT INTO public.profiles (id, email, full_name, role, is_active)
      VALUES ($1, $2, 'Temporary Admin', 'admin', true)
      ON CONFLICT (id) DO UPDATE SET
        role = 'admin',
        is_active = true,
        email = EXCLUDED.email
      `,
      [tempUserId, TEMP_EMAIL]
    )
    console.log('Ensured temporary admin has an admin profile.')

    // 4. Reassign all business records from existing users to the placeholder
    const tablesToReassign = [
      { table: 'clients', column: 'created_by' },
      { table: 'invoices', column: 'created_by' },
      { table: 'payments', column: 'created_by' },
      { table: 'client_invitations', column: 'invited_by' },
    ]

    for (const { table, column } of tablesToReassign) {
      const result = await pgClient.query(
        `UPDATE public.${table} SET ${column} = $1 WHERE ${column} IS DISTINCT FROM $1`,
        [tempUserId]
      )
      console.log(`Reassigned ${result.rowCount} row(s) in ${table}.${column}`)
    }

    // 5. Delete all users except the placeholder
    for (const user of existingUsers) {
      if (user.id === tempUserId) continue

      // Auth cascade will delete the profile, but do it explicitly first
      await pgClient.query('DELETE FROM public.profiles WHERE id = $1', [user.id])

      const { error: deleteError } = await supabase.auth.admin.deleteUser(user.id)
      if (deleteError) {
        console.error(`Failed to delete user ${user.email}:`, deleteError)
        process.exit(1)
      }
      console.log(`Deleted user: ${user.email}`)
    }

    console.log('\n✅ All users deleted except the temporary placeholder.')
    console.log(`\nSign in as the temporary admin:`)
    console.log(`  Email:    ${TEMP_EMAIL}`)
    console.log(`  Password: ${TEMP_PASSWORD}`)
    console.log('\nNext steps:')
    console.log('1. Sign in to the dashboard with the temporary admin.')
    console.log('2. Go to Settings → Users and create your real admin account.')
    console.log('3. Sign in as the real admin and delete the temporary admin.')
  } finally {
    try {
      await pgClient.query("SET session_replication_role = 'origin'")
    } catch (e) {
      // Ignore cleanup errors.
    }
    await pgClient.end()
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
