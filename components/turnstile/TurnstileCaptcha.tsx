// components/turnstile/TurnstileCaptcha.tsx
// Demo package: captcha is permanently disabled. Component is a no-op so any
// residual imports do not load Cloudflare scripts or block forms.

'use client'

import { forwardRef, useImperativeHandle } from 'react'

export interface TurnstileCaptchaRef {
  reset: () => void
}

interface TurnstileCaptchaProps {
  siteKey?: string
  className?: string
}

export const TurnstileCaptcha = forwardRef<TurnstileCaptchaRef, TurnstileCaptchaProps>(
  function TurnstileCaptcha(_props, ref) {
    useImperativeHandle(ref, () => ({
      reset() {
        // no-op
      },
    }))
    return null
  }
)
