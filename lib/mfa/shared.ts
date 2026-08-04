// lib/mfa/shared.ts
// Shared MFA types and constants. Kept out of 'use server' action modules
// because Next.js only allows async function exports from those files.

/** Authenticator apps we surface in the UI. Both speak standard TOTP. */
export type AuthenticatorApp = 'google' | 'microsoft'

export const AUTHENTICATOR_APP_LABELS: Record<AuthenticatorApp, string> = {
  google: 'Google Authenticator',
  microsoft: 'Microsoft Authenticator',
}

export type MfaFactorSummary = {
  id: string
  friendlyName: string | null
  status: 'verified' | 'unverified'
  createdAt: string
}

export type MfaAssuranceLevel = 'aal1' | 'aal2'

export type MfaStatus = {
  enabled: boolean
  factors: MfaFactorSummary[]
  currentLevel: MfaAssuranceLevel | null
  nextLevel: MfaAssuranceLevel | null
}

export type MfaEnrollmentStart = {
  factorId: string
  qrCode: string
  secret: string
  uri: string
  app: AuthenticatorApp
  appLabel: string
}

export function isAuthenticatorApp(value: string): value is AuthenticatorApp {
  return value === 'google' || value === 'microsoft'
}
