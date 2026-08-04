// app/invite/[token]/page.tsx
// Public (no auth required) — this is where the magic-link from the
// invite email lands. Server-side responsibilities:
//
//   1. Look up the invitation by token (service-role client — no auth yet)
//   2. Validate: not revoked, not expired, not already used
//   3. Create the auth user + link the profile to this client (role='client')
//   4. Hand back a verify URL that carries the OTP token; the browser
//      redirects there next and the verify page exchanges it for a session
//
// We split the "accept the invite" step from the "exchange code for
// session" step because cookies can only be set during a real request
// to the user-facing server client — keeping the two steps in the same
// request would mean we'd have to construct cookies manually. Splitting
// them lets the cookie adapter do its job.

import { redirect } from 'next/navigation'
import Link from 'next/link'
import { headers } from 'next/headers'
import { acceptInviteWithToken } from '@/lib/actions/invites'
import { rateLimit } from '@/lib/rate-limit'
import { getClientIp } from '@/lib/ip'
import { createClient } from '@/lib/supabase/server'
import { BrandLogo } from '@/components/layout/BrandLogo'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

export const dynamic = 'force-dynamic'

// The long-lived invite token is in this page's URL. Setting
// referrer=no-referrer prevents the URL (and therefore the token)
// from being sent to any subsequent same-origin navigation via the
// Referer header. Strict-origin-when-cross-origin (the default) would
// otherwise leak it to anything the user clicks on this page.
export async function generateMetadata() {
  return {
    title: 'Your invite',
    other: {
      referrer: 'no-referrer',
    },
  }
}

interface InvitePageProps {
  params: Promise<{ token: string }>
}

export default async function InvitePage({ params }: InvitePageProps) {
  const { token } = await params

  // Per-IP rate limit so an attacker hammering /invite/<random> can't
  // pin a Postgres connection on every attempt. 30 attempts per minute
  // is generous for a real customer (who only ever loads the page
  // once or twice) and tight enough to make brute-forcing a 64-char
  // token impractical even if the entropy were lower than it is.
  //
  // If neither proxy header is present we fall back to a per-token bucket
  // instead of a shared 'unknown' bucket, so a single attacker without an
  // IP can't exhaust the limit for every other visitor.
  const hdrs = await headers()
  const rawIp = getClientIp(hdrs)
  const ip = rawIp === '0.0.0.0' ? '' : rawIp.slice(0, 64)
  const rateLimitKey = ip ? `invite-view:${ip}` : `invite-view:token:${token.slice(0, 64)}`
  const supabase = await createClient()
  const rl = await rateLimit(supabase, rateLimitKey, 30, 60_000, { failOpen: false })
  if (!rl.allowed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="w-full max-w-md">
          <Card>
            <CardHeader className="text-center space-y-4">
              <div className="flex justify-center pt-2">
                <BrandLogo variant="horizontal" className="justify-center" />
              </div>
              <div className="space-y-1">
                <CardTitle>Too many attempts</CardTitle>
                <CardDescription>Please wait a minute and try again.</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <Link href="/login">
                <Button variant="outline" className="w-full">Back to sign in</Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  const result = await acceptInviteWithToken(token)

  if (!result.ok) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="w-full max-w-md">
          <Card>
            <CardHeader className="text-center space-y-4">
              <div className="flex justify-center pt-2">
                <BrandLogo variant="horizontal" className="justify-center" />
              </div>
              <div className="space-y-1">
                <CardTitle>Invite can&apos;t be used</CardTitle>
                <CardDescription>Please ask your contact at Demo Builder Merchant to send a new invite.</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border border-destructive/30 bg-destructive-muted px-4 py-3 text-sm text-destructive">
                {result.error}
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

  // All good — bounce to /invite/verify which exchanges the OTP code
  // for a session cookie. The verify route then redirects to
  // /invite/set-password where the user actually sets their password.
  // The discriminated union narrows ok to true; the data payload is
  // always present on the success branch (this action never returns
  // a partial success), but we guard explicitly so TypeScript agrees.
  if (!result.data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="w-full max-w-md">
          <Card>
            <CardHeader className="text-center space-y-4">
              <div className="flex justify-center pt-2">
                <BrandLogo variant="horizontal" className="justify-center" />
              </div>
              <div className="space-y-1">
                <CardTitle>Invite could not be processed</CardTitle>
                <CardDescription>Please request a new invite from your contact at Demo Builder Merchant.</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <Link href="/login">
                <Button variant="outline" className="w-full">Back to sign in</Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }
  redirect(result.data.redirectTo)
}
