'use server'

/**
 * Payment action passwords are retired. Recording payments re-verify the
 * operator login password via verifyOperatorPassword.
 */

export async function changePaymentPassword(_currentPassword: string, _newPassword: string) {
  return {
    error:
      'Separate payment passwords are no longer used. Payments ask for your login password. Manage it in Settings → Account.',
  }
}

export async function getPaymentPasswordStatus() {
  return { hasPassword: false }
}
