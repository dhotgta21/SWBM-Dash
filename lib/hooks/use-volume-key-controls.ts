'use client'

/**
 * Volume- and media-key controls for the voice assistant.
 *
 * The mic only opens via two routes:
 *   1. Press-and-hold the on-screen button (push-to-talk).
 *   2. Hardware Volume-Up key on a wired headset / car steering wheel /
 *      Bluetooth media button when the dashboard tab is focused.
 *
 * Both routes honour the same pipeline: the mic only stays open while
 * the operator intends to talk. Volume-Down closes the mic. The
 * play/pause media key toggles. Auto-repeat is debounced so a held
 * volume key only fires once.
 *
 * preventDefault() is called on every recognised key so the browser /
 * OS does not change the system volume while the operator is talking.
 *
 * Hardware volume keys are NOT consistently delivered to web pages on
 * every platform (mobile OSes usually swallow them) — so this hook is
 * best-effort. The on-screen push-to-talk button is always the primary
 * trigger.
 */

import { useEffect, useRef, type RefObject } from 'react'

interface UseVolumeKeyControlsOptions {
  /** Called once per Volume-Up press. */
  start: () => void
  /** Called once per Volume-Down press. */
  stop: () => void
  /**
   * Live ref of the listening state. The hook reads `.current` on every
   * keypress so it does not need to re-bind when the state changes.
   */
  isListening: RefObject<boolean>
  /** When false, Volume-Up is ignored (e.g. while loading or terminal). */
  enabled?: boolean
}

/**
 * Pure mapping from a KeyboardEvent.code + listening state to one of:
 *
 *   - 'start'         → fire start()
 *   - 'stop'          → fire stop()
 *   - 'none'          → ignore (e.g. mic disabled, or unknown code)
 *
 * Exported so the hook and the tests can share one source of truth.
 */
export function volumeKeyAction(
  code: string,
  isListening: boolean,
  enabled: boolean
): 'start' | 'stop' | 'none' {
  if (code === 'AudioVolumeUp') {
    return enabled ? 'start' : 'none'
  }
  if (code === 'AudioVolumeDown') {
    return 'stop'
  }
  if (code === 'MediaPlayPause') {
    if (isListening) return 'stop'
    return enabled ? 'start' : 'none'
  }
  return 'none'
}

const RELEVANT_CODES = new Set([
  'AudioVolumeUp',
  'AudioVolumeDown',
  'MediaPlayPause',
])

const DEBOUNCE_MS = 300

export function useVolumeKeyControls({
  start,
  stop,
  isListening,
  enabled = true,
}: UseVolumeKeyControlsOptions) {
  const startRef = useRef(start)
  const stopRef = useRef(stop)
  const enabledRef = useRef(enabled)

  // Keep refs in sync without re-binding the handler.
  useEffect(() => {
    startRef.current = start
    stopRef.current = stop
    enabledRef.current = enabled
  })

  useEffect(() => {
    if (typeof window === 'undefined') return

    let lastCode = ''
    let lastTime = 0

    const handleKeyDown = (event: KeyboardEvent) => {
      const code = event.code
      if (!RELEVANT_CODES.has(code)) return

      // Always swallow the event so the OS / browser does not change
      // the system volume or take over the play/pause media stream
      // while the operator is mid-utterance.
      event.preventDefault()
      event.stopPropagation()

      // Debounce auto-repeat: a long-held media key only fires once.
      const now = Date.now()
      if (code === lastCode && now - lastTime < DEBOUNCE_MS) {
        return
      }
      lastCode = code
      lastTime = now

      const action = volumeKeyAction(
        code,
        isListening.current,
        enabledRef.current
      )
      if (action === 'start') startRef.current()
      else if (action === 'stop') stopRef.current()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isListening])
}
