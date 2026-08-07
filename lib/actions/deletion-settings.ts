'use server'

/**
 * Deletion action passwords are retired. Protected deletes re-verify the
 * operator login password via verifyOperatorPassword.
 */

export async function changeDeletionPassword(_currentPassword: string, _newPassword: string) {
  return {
    error:
      'Separate deletion passwords are no longer used. Protected deletes ask for your login password. Manage it in Settings → Account.',
  }
}

export async function getDeletionPasswordStatus() {
  return { hasPassword: false }
}
