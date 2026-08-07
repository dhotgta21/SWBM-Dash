'use server'

/**
 * Client-account action passwords are retired. Client account money moves
 * re-verify the operator login password via verifyOperatorPassword.
 */

export async function changeClientAccountPassword(
  _currentPassword: string,
  _newPassword: string
) {
  return {
    error:
      'Separate client-account passwords are no longer used. These actions ask for your login password. Manage it in Settings → Account.',
  }
}

export async function getClientAccountPasswordStatus() {
  return { hasPassword: false }
}
