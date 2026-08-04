'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { stripMarkdown } from '@/lib/utils'

interface UseSpeechSynthesisResult {
  supported: boolean
  speaking: boolean
  speak: (text: string, onEnd?: () => void) => void
  cancel: () => void
}

// speak-tts is a browser-only package with no bundled TypeScript declarations.
type SpeakTTSInstance = {
  hasBrowserSupport: () => boolean
  init: (conf: {
    lang?: string
    rate?: number
    pitch?: number
    volume?: number
    splitSentences?: boolean
  }) => Promise<unknown>
  speak: (data: {
    text: string
    queue?: boolean
    listeners?: {
      onstart?: () => void
      onend?: () => void
      onerror?: (event: unknown) => void
    }
  }) => Promise<unknown>
  cancel: () => void
}

export function useSpeechSynthesis(): UseSpeechSynthesisResult {
  const [supported, setSupported] = useState(false)
  const [speaking, setSpeaking] = useState(false)

  // Keep the SpeakTTS instance in a ref so it survives re-renders without
  // triggering effect re-runs. We initialise it lazily inside an effect.
  const speechRef = useRef<SpeakTTSInstance | null>(null)
  // Incremented each time speak/cancel is called so stale promises from a
  // previously-cancelled utterance can't flip speaking back to false.
  const generationRef = useRef(0)
  // Safety timeout ref to reset the speaking state if the browser TTS engine hangs.
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    let mounted = true

    const init = async () => {
      if (typeof window === 'undefined' || !window.speechSynthesis) return

      try {
        const { default: Speech } = await import('speak-tts')
        if (!mounted) return

        const speech = new Speech() as SpeakTTSInstance
        if (!speech.hasBrowserSupport()) return

        await speech.init({
          lang: 'en-GB',
          rate: 1,
          pitch: 1,
          volume: 1,
          splitSentences: true,
        })

        if (!mounted) return
        speechRef.current = speech
        setSupported(true)
      } catch (err) {
        console.warn('TTS initialisation failed:', err)
      }
    }

    void init()

    return () => {
      mounted = false
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
      speechRef.current?.cancel()
      speechRef.current = null
    }
  }, [speechRef])

  const speak = useCallback(
    (text: string, onEnd?: () => void) => {
      const cleaned = stripMarkdown(text).trim()
      if (!cleaned) {
        onEnd?.()
        return
      }

      const speech = speechRef.current
      if (!speech) {
        onEnd?.()
        return
      }

      const generation = ++generationRef.current
      setSpeaking(true)

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }

      // Dynamic safety timeout: ~400ms per word + 4 seconds safety margin.
      const wordCount = cleaned.split(/\s+/).length
      const timeoutMs = Math.max(5000, (wordCount * 400) + 4000)

      timeoutRef.current = setTimeout(() => {
        if (generation !== generationRef.current) return
        console.warn('[useSpeechSynthesis] TTS safety timeout triggered - resetting speaking state')
        setSpeaking(false)
        onEnd?.()
      }, timeoutMs)

      speech
        .speak({ text: cleaned, queue: false })
        .then(() => {
          if (generation !== generationRef.current) return
          if (timeoutRef.current) {
            clearTimeout(timeoutRef.current)
            timeoutRef.current = null
          }
          setSpeaking(false)
          onEnd?.()
        })
        .catch((err) => {
          console.warn('TTS speak failed:', err)
          if (generation !== generationRef.current) return
          if (timeoutRef.current) {
            clearTimeout(timeoutRef.current)
            timeoutRef.current = null
          }
          setSpeaking(false)
          onEnd?.()
        })
    },
    [speechRef]
  )

  const cancel = useCallback(() => {
    generationRef.current++
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    speechRef.current?.cancel()
    setSpeaking(false)
  }, [speechRef])

  return { supported, speaking, speak, cancel }
}
