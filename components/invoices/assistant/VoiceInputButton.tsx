'use client'

/**
 * Voice input — strictly press-and-hold, like a walkie-talkie push-to-talk
 * button (or a phone being picked up). The mental model is exactly:
 *
 *   pointerdown  → "call up"  → start recognition, mic is OPEN
 *   pointerup    → "call down" → stop recognition, mic is CLOSED,
 *                                  transcript (if any) fires once
 *
 * The mic MUST NEVER auto-open. If you press and release, the mic closes
 * on release and stays closed until you press again. Any code that looks
 * like "start the mic after a delay", "re-arm after the assistant
 * speaks", or "open when the user taps something else" is a bug — this
 * is push-to-talk, not always-on listening.
 *
 * The recognition session auto-restarts while the user keeps holding the
 * button. Web Speech API sometimes fires `onend` after a long pause or
 * after ~60 s; if the user is still holding, we transparently re-arm so a
 * 20+ second utterance flows through. A 50 s watchdog forces a stop/start
 * cycle to dodge the API's hard session cap.
 */

import { useState, useRef, useCallback, useEffect, forwardRef, useImperativeHandle } from 'react'
import { Mic } from 'lucide-react'
import { cn } from '@/lib/utils'

interface VoiceInputButtonProps {
  onTranscript: (text: string) => void
  onError?: (error: string) => void
  onListeningChange?: (listening: boolean) => void
  disabled?: boolean
  size?: 'default' | 'large' | 'fab'
  /** Optional label rendered to the right of the icon (used by the 'fab' size). */
  label?: string
  /** True while the caller is processing the most recent transcript. */
  processing?: boolean
}

export interface VoiceInputHandle {
  start: () => void
  stop: () => void
}

interface SpeechRecognitionEvent {
  results: SpeechRecognitionResultList
  resultIndex: number
}

interface SpeechRecognitionErrorEvent {
  error: string
  message?: string
}

interface SpeechRecognition {
  continuous: boolean
  interimResults: boolean
  lang: string
  start(): void
  stop(): void
  abort(): void
  onstart: (() => void) | null
  onend: (() => void) | null
  onresult: ((event: SpeechRecognitionEvent) => void) | null
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null
}

interface SpeechRecognitionConstructor {
  new (): SpeechRecognition
}

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor
    webkitSpeechRecognition?: SpeechRecognitionConstructor
  }
}

const ERROR_MESSAGES: Record<string, string> = {
  not_allowed: 'Microphone permission denied. Please allow microphone access.',
  no_speech: 'No speech detected. Please try again.',
  audio_capture: 'Could not capture audio. Check your microphone.',
  network: 'Voice recognition network error. Please try again.',
}

/**
 * Web Speech API caps a continuous session at ~60 s. To dodge that
 * without chopping the operator's utterance, we voluntarily restart at
 * this interval while the button is held. 50 s leaves a 10 s margin for
 * the in-flight result and final transcription.
 */
const WATCHDOG_INTERVAL_MS = 50_000

export const VoiceInputButton = forwardRef<VoiceInputHandle, VoiceInputButtonProps>(
  function VoiceInputButton(
    { onTranscript, onError, onListeningChange, disabled, size = 'default', label, processing },
    ref
  ) {
    const [listening, setListeningState] = useState(false)
    const [supported, setSupported] = useState(false)
    const recognitionRef = useRef<SpeechRecognition | null>(null)
    // True while the caller (or pointer interaction) wants the mic to be
    // open. Survives auto-restarts triggered by `onend` and the
    // watchdog, so the operator can hold for 20+ seconds without losing
    // capture.
    const intentionalHoldRef = useRef(false)
    // Incremented on every fresh press so callbacks belonging to an aborted
    // recognition session are ignored. Prevents a rapid re-press from racing
    // the still-firing `onend` of the previous session.
    const sessionGenerationRef = useRef(0)
    // Latest transcript index — we only deliver NEW results to the
    // caller, never replay ones already consumed in a previous session.
    const lastEmittedResultIndexRef = useRef(0)
    const watchdogRef = useRef<ReturnType<typeof setInterval> | null>(null)

    // Refs to accumulate voice transcripts across SpeechRecognition sessions
    const accumulatedTextRef = useRef('')
    const latestTranscriptRef = useRef('')

    // Defer feature detection to after mount so the server-rendered HTML
    // matches the first client render (avoids SSR hydration mismatch).
    useEffect(() => {
      setSupported(
        typeof window !== 'undefined' && !!(window.SpeechRecognition || window.webkitSpeechRecognition)
      )
    }, [])

    // Stop recognition when the tab is backgrounded. Browsers throttle or
    // suspend audio capture for hidden tabs and the transcript gets cut
    // off — better to let the user know than to deliver a half-sentence.
    useEffect(() => {
      if (typeof document === 'undefined') return
      const handleVisibility = () => {
        if (document.hidden && recognitionRef.current) {
          try {
            recognitionRef.current.stop()
          } catch {
            // ignore
          }
        }
      }
      document.addEventListener('visibilitychange', handleVisibility)
      return () => document.removeEventListener('visibilitychange', handleVisibility)
    }, [])

    const stopWatchdog = useCallback(() => {
      if (watchdogRef.current !== null) {
        clearInterval(watchdogRef.current)
        watchdogRef.current = null
      }
    }, [])

    // Tear down any active recognition + watchdog when the component
    // unmounts so a tab-leave doesn't leave the mic open in the
    // background.
    useEffect(() => {
      return () => {
        intentionalHoldRef.current = false
        stopWatchdog()
        try {
          recognitionRef.current?.abort()
        } catch {
          // ignore
        }
        recognitionRef.current = null
      }
    }, [stopWatchdog])

    const setListening = useCallback(
      (value: boolean) => {
        setListeningState(value)
        onListeningChange?.(value)
      },
      [onListeningChange]
    )

    const startWatchdog = useCallback(() => {
      stopWatchdog()
      watchdogRef.current = setInterval(() => {
        const rec = recognitionRef.current
        if (!rec || !intentionalHoldRef.current) return
        // Force-stop so `onend` fires, then re-arm in the handler.
        try {
          rec.stop()
        } catch {
          // ignore
        }
      }, WATCHDOG_INTERVAL_MS)
    }, [stopWatchdog])

    const start = useCallback((isRestart = false) => {
      if (!supported || disabled || processing) return
      // For a fresh press, refuse if a session is already active. Reading
      // intentionalHoldRef avoids the React-state latency that made rapid
      // re-presses race the stale `listening` state.
      if (!isRestart && intentionalHoldRef.current) return

      const RecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition
      if (!RecognitionCtor) return

      // Capture intent IMMEDIATELY so an onend-driven auto-restart cannot
      // see a transient false value mid-start.
      intentionalHoldRef.current = true
      lastEmittedResultIndexRef.current = 0

      if (!isRestart) {
        sessionGenerationRef.current += 1
        accumulatedTextRef.current = ''
        latestTranscriptRef.current = ''
      }
      const myGeneration = sessionGenerationRef.current

      recognitionRef.current?.abort()
      const recognition = new RecognitionCtor()
      // Continuous lets the API keep streaming beyond the first result.
      // interimResults=false means we only deliver finalised phrases,
      // but the session itself stays open while the user holds the
      // button — even if they pause to think.
      recognition.continuous = true
      recognition.interimResults = false
      recognition.lang = navigator.language || 'en-GB'

      recognition.onstart = () => {
        if (sessionGenerationRef.current !== myGeneration) return
        setListening(true)
        startWatchdog()
      }

      recognition.onend = () => {
        // Ignore callbacks from an aborted/previous session.
        if (sessionGenerationRef.current !== myGeneration) return
        const wasHeld = intentionalHoldRef.current
        // Clean up the previous instance.
        recognition.onstart = null
        recognition.onend = null
        recognition.onresult = null
        recognition.onerror = null
        if (recognitionRef.current === recognition) {
          recognitionRef.current = null
        }
        stopWatchdog()
        // If the operator is still holding, transparently re-arm so a
        // 20+ second utterance isn't chopped. If they released, close
        // the mic and stand down.
        if (wasHeld) {
          accumulatedTextRef.current = (accumulatedTextRef.current + ' ' + latestTranscriptRef.current).trim()
          latestTranscriptRef.current = ''
          try {
            // start() is idempotent — guards against double-invocation
            // via the watchdog + pointer release race.
            start(true)
          } catch {
            setListening(false)
          }
        } else {
          setListening(false)
          const finalText = (accumulatedTextRef.current + ' ' + latestTranscriptRef.current).trim()
          if (finalText) {
            onTranscript(finalText)
          }
          accumulatedTextRef.current = ''
          latestTranscriptRef.current = ''
        }
      }

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        if (sessionGenerationRef.current !== myGeneration) return
        let fullTranscript = ''
        for (let i = 0; i < event.results.length; i++) {
          const res = event.results[i]
          if (res) {
            fullTranscript += (res[0]?.transcript || '') + ' '
          }
        }
        latestTranscriptRef.current = fullTranscript.trim()
      }

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        // Ignore callbacks from an aborted/previous session.
        if (sessionGenerationRef.current !== myGeneration) return
        // 'aborted' is expected when we intentionally stop/abort or
        // when re-arming; the onend handler is responsible for closing
        // or restarting.
        if (event.error === 'aborted' || event.error === 'no-speech') {
          return
        }
        console.warn('Speech recognition error:', event.error, event.message)
        intentionalHoldRef.current = false
        stopWatchdog()
        setListening(false)
        const message = ERROR_MESSAGES[event.error] || 'Voice input failed. Please try again.'
        onError?.(message)
      }

      recognitionRef.current = recognition

      try {
        recognition.start()
      } catch (err) {
        console.warn('Speech recognition start failed:', err)
        intentionalHoldRef.current = false
        recognitionRef.current = null
        setListening(false)
      }
    }, [supported, disabled, processing, onTranscript, onError, setListening, startWatchdog, stopWatchdog])

    const stop = useCallback(() => {
      intentionalHoldRef.current = false
      stopWatchdog()
      const rec = recognitionRef.current
      if (!rec) return
      try {
        rec.stop()
      } catch {
        // ignore
      }
    }, [stopWatchdog])

    useImperativeHandle(ref, () => ({ start: () => start(false), stop }), [start, stop])

    const handlePointerDown = useCallback(
      (e: React.PointerEvent<HTMLButtonElement>) => {
        if (disabled) return
        e.preventDefault()
        e.currentTarget.setPointerCapture(e.pointerId)
        start()
      },
      [disabled, start]
    )

    const handlePointerUp = useCallback(
      (e: React.PointerEvent<HTMLButtonElement>) => {
        e.preventDefault()
        try {
          e.currentTarget.releasePointerCapture(e.pointerId)
        } catch {
          // ignore
        }
        stop()
      },
      [stop]
    )

    const handlePointerLeave = useCallback(
      (e: React.PointerEvent<HTMLButtonElement>) => {
        if (!listening) return
        e.preventDefault()
        try {
          e.currentTarget.releasePointerCapture(e.pointerId)
        } catch {
          // ignore
        }
        stop()
      },
      [listening, stop]
    )

    const handlePointerCancel = useCallback(
      (e: React.PointerEvent<HTMLButtonElement>) => {
        e.preventDefault()
        try {
          e.currentTarget.releasePointerCapture(e.pointerId)
        } catch {
          // ignore
        }
        stop()
      },
      [stop]
    )

    const handleContextMenu = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault()
    }, [])

    if (!supported) return null

    const isLarge = size === 'large'
    const isFab = size === 'fab'

    const fabBase =
      'inline-flex items-center gap-2 rounded-full pl-3 pr-4 py-2.5 lg:pl-3.5 lg:pr-5 lg:py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 transition-all active:scale-[0.98]'

    return (
      <button
        type="button"
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        onPointerCancel={handlePointerCancel}
        onContextMenu={handleContextMenu}
        disabled={disabled || processing}
        style={{ touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none' }}
        className={cn(
          'relative shrink-0 items-center justify-center rounded-full border transition-all duration-300',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          'disabled:opacity-50 disabled:pointer-events-none',
          isLarge
            ? 'h-20 w-20 border-white/15 text-primary-foreground shadow-2xl shadow-primary/40 hover:scale-[1.05] hover:shadow-primary/55 active:scale-95'
            : isFab
              ? cn(
                  fabBase,
                  listening || processing
                    ? 'bg-primary text-primary-foreground shadow-lg border-primary hover:bg-primary-hover scale-[0.97]'
                    : 'bg-card text-foreground shadow-md border-border hover:bg-secondary hover:shadow-lg'
                )
              : 'inline-flex h-11 w-11 bg-background text-foreground hover:bg-secondary',
          listening && isLarge
            ? 'ring-4 ring-primary/40 scale-95'
            : listening && !isFab
              ? 'bg-destructive text-destructive-foreground border-destructive animate-pulse scale-95'
              : isLarge
                ? 'bg-gradient-to-br from-primary via-primary to-primary-hover'
                : ''
        )}
        aria-label={listening ? 'Recording — release to send' : processing ? 'Processing transcript' : 'Hold to record'}
        title={listening ? 'Recording — release to send' : processing ? 'Processing transcript' : 'Hold to record'}
      >
        {isFab ? (
          <>
            <div
              className={cn(
                'rounded-full p-1.5 transition-colors',
                listening || processing ? 'bg-primary-foreground/20' : 'bg-secondary'
              )}
            >
              <Mic className={cn('relative h-4 w-4', processing && 'animate-pulse')} strokeWidth={2.25} />
            </div>
            {label && (
              <span className="text-sm font-semibold">
                {listening ? 'Listening…' : processing ? 'Processing…' : label}
              </span>
            )}
            {(listening || processing) && (
              <span className="ml-0.5 flex h-2 w-2">
                <span className="absolute inline-flex h-2 w-2 animate-ping rounded-full bg-white opacity-70" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
              </span>
            )}
          </>
        ) : (
          <Mic className={cn(isLarge ? 'h-8 w-8' : 'h-5 w-5')} />
        )}
      </button>
    )
  }
)
