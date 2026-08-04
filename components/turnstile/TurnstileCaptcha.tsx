// components/turnstile/TurnstileCaptcha.tsx
// Cloudflare Turnstile widget wrapper.
// Loads the official Turnstile script and renders the challenge container.
// The widget injects a hidden input named "cf-turnstile-response" into the
// parent form when the challenge completes.

'use client'

import Script from 'next/script'
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'

export interface TurnstileCaptchaRef {
  reset: () => void
}

interface TurnstileCaptchaProps {
  siteKey?: string
  className?: string
}

function getTurnstile() {
  return (typeof window !== 'undefined' && (window as unknown as Record<string, unknown>).turnstile) as
    | {
        render: (container: HTMLElement, options: Record<string, unknown>) => string
        reset?: (widgetId: string) => void
        remove?: (widgetId: string) => void
      }
    | undefined
}

export const TurnstileCaptcha = forwardRef<TurnstileCaptchaRef, TurnstileCaptchaProps>(
  function TurnstileCaptcha({ siteKey, className }, ref) {
    const containerRef = useRef<HTMLDivElement>(null)
    const widgetIdRef = useRef<string | null>(null)
    // When navigating client-side between pages, the Turnstile script may already
    // be loaded. Initialise state from that so the widget renders on every page.
    const [scriptReady, setScriptReady] = useState(() => !!getTurnstile())
    const key = siteKey ?? process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY

    useImperativeHandle(ref, () => ({
      reset: () => {
        const turnstile = getTurnstile()
        if (widgetIdRef.current && turnstile?.reset) {
          turnstile.reset(widgetIdRef.current)
        }
      },
    }))

    useEffect(() => {
      if (!key || !scriptReady || !containerRef.current || widgetIdRef.current) return

      const turnstile = getTurnstile()
      if (!turnstile) {
        console.error('Turnstile script not loaded')
        return
      }

      widgetIdRef.current = turnstile.render(containerRef.current, {
        sitekey: key,
        theme: 'light',
        size: 'normal',
        'refresh-expired': 'auto',
        callback: () => {
          // Token is injected into the form automatically.
        },
        'error-callback': (code: string) => {
          console.error('Turnstile error:', code)
        },
      })

      return () => {
        if (widgetIdRef.current && turnstile.remove) {
          turnstile.remove(widgetIdRef.current)
          widgetIdRef.current = null
        }
      }
    }, [scriptReady, key])

    // Demo / unconfigured deploys: no captcha, no console noise.
    if (!key) {
      return null
    }

    return (
      <div className={className}>
        <Script
          src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
          strategy="afterInteractive"
          onLoad={() => setScriptReady(true)}
          onError={() => {
            // Keep quiet in production demos; captcha is optional when key missing.
          }}
        />
        <div ref={containerRef} />
      </div>
    )
  }
)
