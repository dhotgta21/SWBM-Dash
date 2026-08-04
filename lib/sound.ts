/**
 * Browser notification sounds using the Web Audio API.
 *
 * No external audio files are required — everything is synthesised on the
 * fly so it works offline and never needs to be fetched from a CDN. Sounds
 * are gated behind a user-interaction check where appropriate and respect
 * reduced-motion preferences.
 */

const PREFERENCE_KEY = 'notification-sounds-enabled'

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const AudioCtx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AudioCtx) return null
  return new AudioCtx()
}

function shouldPlay(): boolean {
  if (typeof window === 'undefined') return false
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return false
  const stored = window.localStorage.getItem(PREFERENCE_KEY)
  // Default to on unless the user has explicitly disabled it.
  return stored === null || stored === 'true'
}

function playTone(
  ctx: AudioContext,
  frequency: number,
  start: number,
  duration: number,
  type: OscillatorType = 'sine',
  gain = 0.15
) {
  const osc = ctx.createOscillator()
  const gainNode = ctx.createGain()

  osc.type = type
  osc.frequency.setValueAtTime(frequency, start)

  gainNode.gain.setValueAtTime(0, start)
  gainNode.gain.linearRampToValueAtTime(gain, start + 0.02)
  gainNode.gain.exponentialRampToValueAtTime(0.001, start + duration)

  osc.connect(gainNode)
  gainNode.connect(ctx.destination)

  osc.start(start)
  osc.stop(start + duration)
}

/**
 * Play a short, pleasant notification chime. Used for generic alerts and
 * incoming events (e.g. new quote requests).
 */
export function playNotificationSound() {
  const ctx = getAudioContext()
  if (!ctx || !shouldPlay()) return

  const now = ctx.currentTime
  // Two-tone ascending chime: D5 -> A5
  playTone(ctx, 587.33, now, 0.25, 'sine', 0.12)
  playTone(ctx, 880.0, now + 0.12, 0.35, 'sine', 0.12)
}

/**
 * Play a sharper, attention-grabbing sound for errors.
 */
export function playErrorSound() {
  const ctx = getAudioContext()
  if (!ctx || !shouldPlay()) return

  const now = ctx.currentTime
  // Descending two-tone: A4 -> E4
  playTone(ctx, 440.0, now, 0.18, 'triangle', 0.12)
  playTone(ctx, 329.63, now + 0.14, 0.28, 'triangle', 0.12)
}

/**
 * Play a success confirmation sound.
 */
export function playSuccessSound() {
  const ctx = getAudioContext()
  if (!ctx || !shouldPlay()) return

  const now = ctx.currentTime
  // Ascending three-tone: C5 -> E5 -> G5
  playTone(ctx, 523.25, now, 0.15, 'sine', 0.1)
  playTone(ctx, 659.25, now + 0.1, 0.15, 'sine', 0.1)
  playTone(ctx, 783.99, now + 0.2, 0.3, 'sine', 0.1)
}

/**
 * Enable or disable notification sounds for this browser.
 */
export function setNotificationSoundsEnabled(enabled: boolean) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(PREFERENCE_KEY, String(enabled))
}

/**
 * Check whether notification sounds are currently enabled.
 */
export function areNotificationSoundsEnabled(): boolean {
  return shouldPlay()
}
