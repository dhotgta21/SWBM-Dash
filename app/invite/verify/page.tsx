// app/invite/verify/page.tsx
// Entry point for invite links (staff `type=invite` and client-portal
// `type=magiclink`).
//
// IMPORTANT: this page must NOT consume the OTP on a bare GET. Email
// providers (Outlook Safe Links, Gmail, corporate scanners) pre-fetch links
// in emails; if we exchanged the token here, that pre-fetch would burn the
// single-use token and the real person would see "link expired" on their
// first click. Instead we render <InviteVerifyAutoSubmit>, which consumes the
// token via a server-action POST that only a real browser makes.
//
// On consumption failure the action redirects back here with ?error=expired
// and we show the "link expired" card (the token is gone at that point, so the
// only sensible action is to request a new invite).

import { redirect } from 'next/navigation'
import Link from 'next/link'
import { BrandLogo } from '@/components/layout/BrandLogo'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { InviteVerifyAutoSubmit } from '@/components/auth/InviteVerifyAutoSubmit'

export const dynamic = 'force-dynamic'

// The magic-link OTP is in this page's URL on arrival. Tighten the referrer
// policy so it can never leak via Referer before the POST consumes it.
export async function generateMetadata() {
  return {
    title: 'Verifying your invite',
    other: {
      referrer: 'no-referrer',
    },
  }
}

interface VerifyPageProps {
  searchParams: Promise<{ token?: string; type?: string; next?: string; error?: string }>
}

// Both 'magiclink' (client portal invite) and 'invite' (staff invite) are
// acceptable here — they both land the user on /invite/set-password.
const ALLOWED_OTP_TYPES = new Set(['magiclink', 'invite'])

export default async function InviteVerifyPage({ searchParams }: VerifyPageProps) {
  const { token, type, next, error } = await searchParams

  // The consume action bounces back here when verifyOtp fails (expired,
  // already-used, or invalid token). By now the token is gone, so the only
  // helpful path is to request a fresh invite.
  if (error === 'expired') {
    return <ExpiredCard />
  }

  if (!token || !type || !ALLOWED_OTP_TYPES.has(type)) {
    redirect('/login?error=invalid_invite')
  }

  return (
    <InviteVerifyAutoSubmit
      token={token}
      type={type}
      next={next ?? '/invite/set-password'}
    />
  )
}

function ExpiredCard() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <Card>
          <CardHeader className="text-center space-y-4">
            <div className="flex justify-center pt-2">
              <BrandLogo variant="horizontal" className="justify-center" />
            </div>
            <div className="space-y-1">
              <CardTitle>Sign-in link expired</CardTitle>
              <CardDescription>The invite link is no longer valid.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border border-destructive/30 bg-destructive-muted px-4 py-3 text-sm text-destructive">
              This link has expired or already been used. Please request a new invite.
            </div>
            <div className="mt-4 text-center">
              <Link href="/login">
                <Button variant="outline">Back to sign in</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
