'use client'

// Renders the interstitial for /invite/verify and immediately submits the
// hidden form (via a server action) so the human is sent straight through to
// /invite/set-password. The form POST — not the page GET — is what consumes
// the single-use OTP, which keeps email link-scanners from burning it.
//
// A visible "Continue" button is kept as a no-JS / interrupted-submit fallback.

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Loader2 } from 'lucide-react'
import { consumeInvite } from '@/lib/actions/consume-invite'
import { BrandLogo } from '@/components/layout/BrandLogo'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

interface InviteVerifyAutoSubmitProps {
  token: string
  type: string
  next: string
}

export function InviteVerifyAutoSubmit({ token, type, next }: InviteVerifyAutoSubmitProps) {
  const formRef = useRef<HTMLFormElement>(null)
  const submitted = useRef(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (submitted.current) return
    submitted.current = true
    // Auto-submit so the human barely notices this step. Email link scanners
    // do not execute JavaScript, so this only ever fires in a real browser —
    // which is precisely what protects the single-use token.
    formRef.current?.requestSubmit()
  }, [])

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <Card>
          <CardHeader className="text-center space-y-4">
            <div className="flex justify-center pt-2">
              <BrandLogo variant="horizontal" className="justify-center" />
            </div>
            <div className="space-y-1">
              <CardTitle>Verifying your invitation</CardTitle>
              <CardDescription>Hold on a moment while we confirm your invite link.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <form
              ref={formRef}
              action={consumeInvite}
              onSubmit={() => setBusy(true)}
              className="space-y-4"
            >
              <input type="hidden" name="token" value={token} />
              <input type="hidden" name="type" value={type} />
              <input type="hidden" name="next" value={next} />
              <div className="flex flex-col items-center gap-3 py-2">
                <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden />
                <p className="text-sm text-muted-foreground">Confirming your link…</p>
              </div>
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? 'Continuing…' : 'Continue'}
              </Button>
            </form>
            <div className="mt-4 text-center text-sm">
              <Link href="/login" className="font-medium text-primary hover:text-primary-hover">
                Back to sign in
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
