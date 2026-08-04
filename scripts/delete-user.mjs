#!/usr/bin/env node
// Delete a user and reassign their created records to another admin.
// Usage: source .env.local && node scripts/delete-user.mjs <email-to-delete> [replacement-admin-email]
import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const targetEmail = process.argv[2]
const replacementEmail = process.argv[3]

if (!url || !serviceRoleKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars')
  console.error('Run with: source .env.local && node scripts/delete-user.mjs <email> [replacement-admin-email]')
  process.exit(1)
}

if (!targetEmail) {
  console.error('Usage: source .env.local && node scripts/delete-user.mjs <email-to-delete> [replacement-admin-email]')
  process.exit(1)
}

const supabase = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function main() {
  // 1. Resolve target auth user
  const { data: list, error: listError } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  })
  if (listError) throw listError

  const targetUser = list.users.find(u => u.email?.toLowerCase() === targetEmail.toLowerCase())
  if (!targetUser) {
    console.error(`No auth user found for ${targetEmail}`)
    process.exit(1)
  }

  console.log(`Target user: ${targetUser.id} (${targetUser.email})`)

  // 2. Find a replacement admin to reassign records to
  let replacementId
  if (replacementEmail) {
    const replacementUser = list.users.find(u => u.email?.toLowerCase() === replacementEmail.toLowerCase())
    if (!replacementUser) {
      console.error(`Replacement admin not found: ${replacementEmail}`)
      process.exit(1)
    }
    replacementId = replacementUser.id
  } else {
    // Pick another active admin from profiles
    const { data: admins, error: adminsError } = await supabase
      .from('profiles')
      .select('id, email')
      .eq('role', 'admin')
      .eq('is_active', true)
      .neq('id', targetUser.id)
      .limit(1)

    if (adminsError) throw adminsError
    if (!admins || admins.length === 0) {
      console.error(
        'No other active admin found. You must keep at least one admin in the system.\n' +
        'Either create another admin first, or provide a replacement-admin-email argument.'
      )
      process.exit(1)
    }
    replacementId = admins[0].id
    console.log(`Will reassign records to: ${admins[0].email} (${replacementId})`)
  }

  // 3. Reassign foreign-key references that block deletion.
  // Includes picker RESTRICT FKs (delivery_loads.picked_by, stock_audit_alerts
  // .raised_by) — drivers use ON DELETE SET NULL so they do not need this.
  const tablesToReassign = [
    { table: 'clients', column: 'created_by' },
    { table: 'invoices', column: 'created_by' },
    { table: 'payments', column: 'created_by' },
    { table: 'client_invitations', column: 'invited_by' },
    { table: 'delivery_loads', column: 'picked_by' },
    { table: 'stock_audit_alerts', column: 'raised_by' },
  ]

  for (const { table, column } of tablesToReassign) {
    const { error, count } = await supabase
      .from(table)
      .update({ [column]: replacementId }, { count: 'exact' })
      .eq(column, targetUser.id)

    if (error) {
      console.error(`Failed to reassign ${table}.${column}:`, error)
      process.exit(1)
    }
    console.log(`Reassigned ${table}.${column} (${count ?? '?'} row(s))`)
  }

  // 4. Delete profile row
  const { error: profileDeleteError } = await supabase
    .from('profiles')
    .delete()
    .eq('id', targetUser.id)

  if (profileDeleteError) {
    console.error('Failed to delete profile:', profileDeleteError)
    process.exit(1)
  }
  console.log('Deleted profile row')

  // 5. Delete auth user
  const { error: authDeleteError } = await supabase.auth.admin.deleteUser(targetUser.id)
  if (authDeleteError) {
    console.error('Failed to delete auth user:', authDeleteError)
    process.exit(1)
  }

  console.log(`\nUser ${targetEmail} deleted successfully.`)
  console.log('You can now recreate the account via Supabase Auth or the admin invite flow.')
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
