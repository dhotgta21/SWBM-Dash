'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, ShieldAlert } from 'lucide-react'
import { cn } from '@/lib/utils'

interface BrowserCapability {
  /** Web Speech API is exposed on `window` (Chromium / Safari / Edge). */
  speechRecognition: boolean
  /** Page is served over HTTPS (or localhost — Speech API requires it). */
  secureContext: boolean
  /** True on Firefox, which does not implement the Web Speech API. */
  isFirefox: boolean
}

/**
 * Detects why the voice assistant cannot run in the current browser and
 * returns a small banner describing what the operator should do.
 */
export function VoiceCapabilityBanner() {
  const [capability, setCapability] = useState<BrowserCapability | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const ua = navigator.userAgent.toLowerCase()
    const isFirefox = ua.includes('firefox')
    const speechRecognition = !!(
      window.SpeechRecognition || window.webkitSpeechRecognition
    )
    const secureContext =
      window.isSecureContext ||
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1'
    // Browser capability detection is inherently side-effectful and must run
    // once after mount to avoid SSR/client mismatch. Suppress the rule that
    // forbids setState directly in an effect for this one-off detection.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCapability({ speechRecognition, secureContext, isFirefox })
  }, [])

  if (!capability) return null

  if (!capability.speechRecognition) {
    return (
      <div
        role="status"
        className={cn(
          'mx-auto flex max-w-xl items-start gap-2 rounded-lg',
          'border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning'
        )}
      >
        <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <div>
          {capability.isFirefox
            ? 'Firefox does not currently support speech recognition. Please switch to Chrome, Edge, or Safari for voice-driven invoice creation.'
            : 'Speech recognition is not available in this browser. Voice input is disabled, but you can still type by clicking "New invoice" or contacting your administrator.'}
        </div>
      </div>
    )
  }

  if (!capability.secureContext) {
    return (
      <div
        role="status"
        className={cn(
          'mx-auto flex max-w-xl items-start gap-2 rounded-lg',
          'border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning'
        )}
      >
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <div>
          Browsers will not grant microphone access over plain HTTP. Ask
          your administrator to enable HTTPS for the dashboard.
        </div>
      </div>
    )
  }

  return null
}
