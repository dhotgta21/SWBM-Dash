'use client'

/* eslint-disable react-hooks/set-state-in-effect */

import { useState, useRef, useEffect, useCallback } from 'react'
import { runInvoiceAssistantStep } from '@/lib/actions/invoice-assistant'
import { emptyDraft, formatDeliveryAddress, clientDisplayName } from '@/lib/ai/invoice-assistant/draft'
import {
  type AssistantDraft,
  type AssistantLineItem,
  type AssistantState,
  type AssistantMessage,
  type ClientAction,
} from '@/lib/ai/invoice-assistant/types'
import { createClient } from '@/lib/supabase/client'
import { VoiceInputButton, type VoiceInputHandle } from './VoiceInputButton'
import { ProductIntentCard } from './ProductIntentCard'
import { VoiceCapabilityBanner } from './VoiceCapabilityBanner'
import { useSpeechSynthesis } from '@/lib/hooks/use-speech-synthesis'
import { Button } from '@/components/ui/button'
import { EyebrowChip, PageHeader } from '@/components/ui/PageHeader'
import { cn } from '@/lib/utils'
import {
  extractProductIntent,
  mergeProductIntentSlots,
  type ParsedIntent,
} from '@/lib/voice/product-intent'
import { classifyUtterance } from '@/lib/voice/utterance-classifier'
import { extractConciseHead } from '@/lib/voice/concise-prompt'
import { useVolumeKeyControls } from '@/lib/hooks/use-volume-key-controls'
import {
  Plus,
  User,
  Package,
  MapPin,
  CheckCircle2,
} from 'lucide-react'

interface InvoiceAssistantProps {
  canSendEmail: boolean
}

const STORAGE_KEY = 'swbm-assistant-session'

/**
 * Bump this any time the shape of the persisted session changes (added
 * fields, renamed state, etc.). Old payloads are dropped on mismatch so
 * we never hydrate a draft that no longer matches the runtime schema.
 */
const STORAGE_SCHEMA_VERSION = 2

function loadSession() {
  if (typeof window === 'undefined') return null
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (!saved) return null
    const parsed = JSON.parse(saved) as {
      schemaVersion?: number
      messages: AssistantMessage[]
      draft: AssistantDraft
      state: AssistantState
    }
    // Drop stale sessions from older schema versions so a redeploy
    // never resurrects a half-finished draft that the new code can't
    // reason about.
    if (parsed.schemaVersion !== STORAGE_SCHEMA_VERSION) return null
    return parsed
  } catch {
    // ignore corrupt storage
  }
  return null
}

export function InvoiceAssistant({ canSendEmail }: InvoiceAssistantProps) {
  // Always start with the default state on first render so SSR and the
  // first client render match. We restore the saved session from
  // localStorage in a useEffect after mount — this avoids an SSR/client
  // hydration mismatch on `messages` / `draft` / `state`.
  const [messages, setMessages] = useState<AssistantMessage[]>([
    { role: 'assistant', content: 'Who is this invoice for?' },
  ])
  const [draft, setDraft] = useState<AssistantDraft>(() => emptyDraft('invoice'))
  const [state, setState] = useState<AssistantState>('awaiting_client')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [actionStatus, setActionStatus] = useState<string | null>(null)
  const [listening, setListening] = useState(false)
  const [voiceProcessing, setVoiceProcessing] = useState(false)
  const [hydrated, setHydrated] = useState(false)
  /**
   * The most recent voice utterance that the local slot extractor
   * recognised as a product intent. Operators confirm, edit, or cancel
   * the card before the utterance is forwarded to the LLM — this gates
   * the model away from raw transcripts the operator hasn't read yet.
   */
  const [pendingIntent, setPendingIntent] = useState<
    { utterance: string; intent: ParsedIntent } | null
  >(null)
  const { speaking, speak, cancel: cancelSpeech } = useSpeechSynthesis()
  const voiceRef = useRef<VoiceInputHandle>(null)
  const manualStopRef = useRef(false)
  const justCapturedRef = useRef(false)
  const lastSpokenRef = useRef<string | null>(null)
  const listeningRef = useRef(false)
  // Monotonically incremented when the operator starts a new invoice. Any
  // in-flight handleSend that returns after a new session has started is
  // discarded so a stale LLM response cannot overwrite a fresh draft.
  const sessionRef = useRef(0)
  const handleSendRef = useRef<(text: string, options?: { skipGate?: boolean; draftOverride?: AssistantDraft }) => Promise<void>>(
    async () => {}
  )
  // Keep the volume-key hook's listening-ref in sync with the visible
  // listening state without re-binding the keydown handler.
  useEffect(() => {
    listeningRef.current = listening
  }, [listening])

  // Hardware volume-up/down keys act as alternative mic triggers. The
  // on-screen push-to-talk button is the primary path; this is
  // best-effort for headsets / car media buttons when the tab is
  // focused. (Hook is registered further down once `terminal` has
  // been resolved.)
  const startVoiceCapture = useCallback(() => {
    if (typeof window === 'undefined') return
    if (!(window.SpeechRecognition || window.webkitSpeechRecognition)) {
      setError(
        'Voice input is not supported in this browser. Try Chrome, Edge, or Safari.'
      )
      return
    }
    voiceRef.current?.start()
  }, [])
  const stopVoiceCapture = useCallback(() => voiceRef.current?.stop(), [])

  // Restore saved session from localStorage after mount, and mark hydrated
  // so the persistence effect below can start writing. This intentionally
  // runs in an effect to avoid an SSR/localStorage hydration mismatch.
  useEffect(() => {
    const saved = loadSession()
    if (saved) {
      setMessages(saved.messages)
      setDraft(saved.draft)
      setState(saved.state)
    }
    setHydrated(true)
  }, [])

  // Persist session whenever it changes.
  useEffect(() => {
    if (!hydrated) return
    const payload = {
      schemaVersion: STORAGE_SCHEMA_VERSION,
      messages: messages.slice(-20), // keep last 20 messages so the
      // payload stays under the 5 MB localStorage quota during long sessions
      draft,
      state,
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
    } catch (err) {
      // Quota exceeded or storage unavailable — surface a soft warning
      // so the operator can still finish the session; just won't survive
      // a page reload.
      console.warn('[invoice-assistant] could not persist session:', err)
      setError(
        'Browser storage is full. The current draft will not survive a page reload.'
      )
    }
  }, [messages, draft, state, hydrated])

  const executeClientAction = useCallback(
    async (action: ClientAction, draftOverride?: AssistantDraft) => {
      switch (action.type) {
        case 'open_whatsapp': {
          window.open(
            `https://wa.me/?text=${encodeURIComponent(action.text)}`,
            '_blank',
            'noopener,noreferrer'
          )
          setActionStatus('WhatsApp opened with the invoice pre-filled.')
          break
        }
        case 'send_email': {
          if (!canSendEmail) {
            setError('Your account is not allowed to send emails.')
            break
          }
          const ok = await sendEmail(action.invoice_id, action.recipient)
          setActionStatus(ok ? 'Email sent.' : 'Email failed to send.')
          break
        }
        case 'download_pdf': {
          // Read the doc number from the just-returned draft (if any) —
          // component state still holds the pre-create draft at this point.
          const created = draftOverride?.createdInvoice ?? draft.createdInvoice
          const docNumber =
            typeof created?.document_number === 'string'
              ? created.document_number
              : undefined
          const ok = await downloadPdf(action.invoice_id, docNumber)
          setActionStatus(ok ? 'PDF downloaded.' : 'PDF download failed.')
          break
        }
      }
    },
    [canSendEmail, draft.createdInvoice]
  )

  const handleSend = useCallback(
    async (text: string, options?: { skipGate?: boolean; draftOverride?: AssistantDraft }) => {
      const trimmed = text.trim()
      setVoiceProcessing(false)
      if (!trimmed || loading) return
      const sessionAtStart = sessionRef.current
      voiceRef.current?.stop()
      cancelSpeech()

      // If a product intent is pending confirmation, route the utterance
      // through the yes/no/edit classifier FIRST. This keeps the LLM
      // away from confirmations it doesn't need to process — and blocks
      // raw transcripts from leaking into the model when the operator
      // hasn't yet acknowledged what we heard.
      if (
        !options?.skipGate &&
        pendingIntent &&
        state === 'awaiting_items'
      ) {
        const verdict = classifyUtterance(trimmed)
        if (verdict === 'yes') {
          const summary = formatIntentAsUtterance(pendingIntent.intent)
          const updatedDraft: AssistantDraft = {
            ...draft,
            pendingItem: parsedIntentToPendingItem(pendingIntent.intent),
          }
          setPendingIntent(null)
          // Forward a clean confirmation string onward, bypassing the
          // gate (which would otherwise re-classify "Add 13 bags..." as
          // an EDIT utterance and re-enter itself).
          void handleSendRef.current(summary, { skipGate: true, draftOverride: updatedDraft })
          return
        }
        if (verdict === 'no') {
          setPendingIntent(null)
          return
        }
        if (verdict === 'edit') {
          // Re-parse the operator's correction. Two paths:
          //
          //   (a) slot-fill: the follow-up provides a value for one of
          //       the slots the previous intent was missing (e.g. the
          //       operator has captured "13 bags of cement" and now
          //       says "£15 each" — fill the price slot without
          //       starting over). This is the £15-only pipeline bug.
          //
          //   (b) replacement: the follow-up captures strictly more
          //       slots than the previous, so swap the pending intent
          //       for the new one.
          //
          // If neither wins, drop the gate and forward the raw
          // utterance to the LLM.
          const reparsed = extractProductIntent(trimmed)
          const next = reparsed.intents[0]
          const previous = pendingIntent.intent

          if (next) {
            const merged = mergeProductIntentSlots(previous, next)
            // Slot-fill wins as long as any missing slot was filled.
            const filledAnything =
              merged.missing.length < previous.missing.length
            // Replacement wins when the new parse is strictly more
            // complete than the previous AND we didn't already have
            // a high-confidence intent.
            const replaced =
              !filledAnything &&
              (next.missing.length < previous.missing.length ||
                (next.confidence === 'high' && previous.confidence !== 'high'))

            if (filledAnything) {
              setPendingIntent({ utterance: trimmed, intent: merged })
              return
            }
            if (replaced) {
              setPendingIntent({ utterance: trimmed, intent: next })
              return
            }
          }
          // Could not improve; treat as a normal message and drop the gate.
          setPendingIntent(null)
        }
      }

      const userMessage: AssistantMessage = { role: 'user', content: trimmed }
      const nextMessages = [...messages, userMessage]
      setMessages(nextMessages)
      setLoading(true)
      setError(null)
      setActionStatus(null)

      try {
        const currentDraft = options?.draftOverride ?? draft
        const result = await runInvoiceAssistantStep({ messages: nextMessages, draft: currentDraft, state })

        // If the operator started a new invoice while this request was in
        // flight, drop the stale result entirely.
        if (sessionRef.current !== sessionAtStart) {
          return
        }

        setMessages(result.messages)
        setDraft(result.draft)
        setState(result.state)

        if (result.error) {
          setError(result.error)
        }

        if (result.clientActions && result.clientActions.length > 0) {
          for (const action of result.clientActions) {
            await executeClientAction(action, result.draft)
          }
        }
      } catch (err) {
        console.error('[invoice-assistant] handleSend error:', err)
        if (sessionRef.current === sessionAtStart) {
          setError(err instanceof Error ? err.message : 'Assistant failed. Please try again.')
        }
      } finally {
        setLoading(false)
      }
    },
    [
      messages,
      draft,
      state,
      loading,
      executeClientAction,
      cancelSpeech,
      pendingIntent,
    ]
  )
  // Keep the ref pointing at the latest handleSend closure without
  // reading it during render.
  useEffect(() => {
    handleSendRef.current = handleSend
  }, [handleSend])

  // A pending intent only makes sense while we are collecting items. If the
  // server moves the conversation to another step, drop the card so it cannot
  // resurface or leak into a later state.
  useEffect(() => {
    if (state !== 'awaiting_items') {
      setPendingIntent(null)
    }
  }, [state])

  // Speak the latest assistant message. We deliberately do NOT auto-re-arm
  // the microphone when speech synthesis finishes — the operator must hold
  // (or accept the call) to send the next utterance. This prevents the mic
  // from opening unprompted when the user just wanted to read the response.
  useEffect(() => {
    if (loading) return
    const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant')
    if (!lastAssistant || lastAssistant.content === lastSpokenRef.current) return
    lastSpokenRef.current = lastAssistant.content
    speak(lastAssistant.content)
  }, [loading, messages, speak])

  // Hands-free confirmation prompt: read back what the local parser captured
  // and ask the operator to confirm by voice. This is essential for car /
  // hands-free use where pressing the on-screen Confirm button is unsafe.
  const lastConfirmationPromptRef = useRef<string | null>(null)
  useEffect(() => {
    if (!pendingIntent || listening || speaking || loading || voiceProcessing) return
    const prompt = formatIntentAsConfirmationPrompt(pendingIntent.intent)
    if (prompt === lastConfirmationPromptRef.current) return
    lastConfirmationPromptRef.current = prompt
    speak(prompt)
  }, [pendingIntent, listening, speaking, loading, voiceProcessing, speak])

  const handleVoiceTranscript = useCallback(
    (text: string) => {
      if (!text.trim()) return
      justCapturedRef.current = true
      setVoiceProcessing(true)

      // Gatekeeper: when the operator is adding an item, parse the
      // utterance locally FIRST. If the parse yields a usable product
      // intent, surface the confirmation card instead of forwarding raw
      // speech to the LLM. The operator's "yes" / "no" / correction then
      // resolves the card before the LLM is involved.
      if (state === 'awaiting_items' && !pendingIntent) {
        const parsed = extractProductIntent(text)
        const first = parsed.intents[0]
        if (first) {
          // Show the card whenever the utterance captured a product OR a
          // quantity — even if a price is missing the operator should
          // see what we heard and confirm the slot that's still needed.
          const hasSlots = !!(first.product || first.quantity)
          if (hasSlots) {
            setVoiceProcessing(false)
            setPendingIntent({ utterance: text.trim(), intent: first })
            return
          }
        }
      }

      void handleSend(text)
    },
    [handleSend, state, pendingIntent]
  )

  const handleListeningChange = useCallback(
    (isListening: boolean) => {
      setListening(isListening)
      if (isListening) {
        manualStopRef.current = false
        justCapturedRef.current = false
        cancelSpeech()
      } else if (!justCapturedRef.current) {
        // Mic stopped without capturing speech (silence timeout or manual stop).
        manualStopRef.current = true
      }
      justCapturedRef.current = false
    },
    [cancelSpeech]
  )

  const handleNewInvoice = useCallback(() => {
    sessionRef.current += 1
    localStorage.removeItem(STORAGE_KEY)
    cancelSpeech()
    voiceRef.current?.stop()
    setVoiceProcessing(false)
    setMessages([{ role: 'assistant', content: 'Who is this invoice for?' }])
    setDraft(emptyDraft('invoice'))
    setState('awaiting_client')
    setError(null)
    setActionStatus(null)
    lastSpokenRef.current = null
    manualStopRef.current = true // mic stays off; user must press hold to speak
    setPendingIntent(null)
  }, [cancelSpeech])

  /**
   * Operator accepted the captured product intent card. Translate the
   * parsed slots back into a clean English line, pre-fill the pending item
   * so the LLM preserves the captured slots, and forward the line to the
   * LLM as if the operator had said it.
   */
  const confirmPendingIntent = useCallback(() => {
    if (!pendingIntent) return
    const summary = formatIntentAsUtterance(pendingIntent.intent)
    const updatedDraft: AssistantDraft = {
      ...draft,
      pendingItem: parsedIntentToPendingItem(pendingIntent.intent),
    }
    setPendingIntent(null)
    // Pass the updated draft directly so the LLM sees the locked pending item
    // immediately, without waiting for a React state cycle.
    void handleSend(summary, { draftOverride: updatedDraft })
  }, [pendingIntent, handleSend, draft])

  /**
   * Operator wants to adjust the captured details. The simplest UX in a
   * voice-only flow is to re-open the mic and let them dictate a
   * corrected version — that path is already handled by the classifier
   * in handleSend. Here we just drop the card.
   */
  const editPendingIntent = useCallback(() => {
    setPendingIntent(null)
  }, [])

  const cancelPendingIntent = useCallback(() => {
    setPendingIntent(null)
  }, [])

  const currentPrompt = getCurrentPrompt({
    messages,
    state,
    draft,
    pendingIntent: pendingIntent ? { intent: pendingIntent.intent } : null,
  })
  const terminal = state === 'created' || state === 'done'
  const voiceActive = listening || speaking

  // Press-and-hold is the only voice trigger. The mic must NEVER auto-open
  // after a save, page navigation, or a previous assistant reply — opening
  // unprompted is the original bug we're fixing here.
  // (Auto-restart effects and the original `useVoiceMediaControls` removed.)
  //
  // Hardware volume / media keys are mapped as additional opt-in triggers
  // on top of press-and-hold — Volume-Up starts, Volume-Down stops, the
  // Play/Pause media key toggles. The on-screen button is still primary.
  useVolumeKeyControls({
    start: startVoiceCapture,
    stop: stopVoiceCapture,
    isListening: listeningRef,
    enabled: !loading && !speaking && !terminal && !voiceProcessing,
  })

  return (
    <div className="relative flex h-full flex-col bg-background overflow-hidden">
      {/* Decorative background — soft brand glow that intensifies while listening */}
      <div
        aria-hidden
        className={cn(
          'pointer-events-none absolute inset-0 transition-opacity duration-700',
          voiceActive ? 'opacity-100' : 'opacity-60'
        )}
        style={{
          background:
            'radial-gradient(ellipse at 50% 110%, color-mix(in srgb, var(--primary) 14%, transparent) 0%, transparent 55%)',
        }}
      />

      {/* Header — uses the same PageHeader pattern as Analytics / Invoices /
          every other dashboard page so the assistant feels native. */}
      <PageHeader
        className="relative z-10 shrink-0 pb-4"
        eyebrow={
          <>
            <EyebrowChip label="Assistant" tone="primary" />
            <span className="hidden text-muted-foreground/60 sm:inline">/</span>
            <span className="hidden sm:inline">Voice</span>
          </>
        }
        title="Invoice Assistant"
        description="Speak naturally — the assistant captures client, items, and address."
        actions={
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleNewInvoice}
            className="gap-1.5"
          >
            <Plus className="h-4 w-4" />
            New invoice
          </Button>
        }
      />

      {/* Main content — pipeline-aware progressive disclosure. Only the
          blocks relevant to the current step are rendered, so a phone-screen
          shows the operator exactly what they need to do next without
          scrolling through future steps. */}
      <div className="relative z-10 flex-1 min-h-0 overflow-hidden">
        {/* Capability banner — explains why voice input isn't available
            when the browser / context doesn't support it. */}
        <div className="shrink-0 px-4 pt-2">
          <VoiceCapabilityBanner />
        </div>

        <div className="mx-auto flex h-full max-w-xl flex-col gap-2 px-4 py-2">
          {/* Compact progress strip — single line, dots only on mobile,
              label on sm+. Tells the operator "where we are" without
              competing with the body for vertical space. */}
          <PipelineProgress state={state} terminal={terminal} />

          {/* Body — only the active step renders. Previous steps show
              compact "locked" chips. Future steps are invisible. */}
          <div className="flex-1 min-h-0 overflow-y-auto">
            {state === 'awaiting_client' && (
              <ClientBlock draft={draft} messages={messages} />
            )}
            {(state === 'awaiting_items' ||
              state === 'awaiting_delivery_address' ||
              state === 'confirming') && (
              <PipelineBody
                draft={draft}
                state={state}
                messages={messages}
                error={error}
              />
            )}
            {(state === 'created' || state === 'done') && (
              <DoneBlock draft={draft} />
            )}
          </div>

          {/* Pending intent gate — visible only while the local parser has
              captured something the operator hasn't yet acknowledged and we
              are still in the items step. */}
          {pendingIntent && state === 'awaiting_items' && (
            <div className="animate-assistant-fade-up shrink-0">
              <ProductIntentCard
                utterance={pendingIntent.utterance}
                intent={pendingIntent.intent}
                busy={loading}
                onConfirm={confirmPendingIntent}
                onEdit={editPendingIntent}
                onCancel={cancelPendingIntent}
              />
            </div>
          )}

          {/* Action status / error */}
          {(actionStatus || error) && (
            <div
              role="status"
              className={cn(
                'animate-assistant-fade-up shrink-0 rounded-lg px-3 py-1.5 text-center text-xs',
                error
                  ? 'border border-destructive/40 bg-destructive/10 text-destructive'
                  : 'border border-info/40 bg-info/10 text-info'
              )}
            >
              {error || actionStatus}
            </div>
          )}
        </div>
      </div>

      {/* Bottom action bar — concise prompt on the left, voice + accept
          controls on the right. The whole bar is one thumb-press wide on
          mobile. Press-and-hold the mic to talk; release to send. */}
      <div
        className="relative z-10 shrink-0 border-t border-border/60 bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/85"
        aria-live="polite"
      >
        <div className="mx-auto flex max-w-xl items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
              {terminal ? 'Done' : listening ? 'Listening' : speaking ? 'Speaking' : voiceProcessing ? 'Processing…' : loading ? 'Thinking' : 'Hold to talk'}
            </p>
            <p className="truncate text-base font-semibold leading-tight text-foreground sm:text-lg">
              {currentPrompt}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <VoiceInputButton
              ref={voiceRef}
              onTranscript={handleVoiceTranscript}
              onError={setError}
              onListeningChange={handleListeningChange}
              disabled={loading || speaking || terminal}
              processing={voiceProcessing}
              size="fab"
              label="Hold"
            />
          </div>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Pipeline progress — single-line step indicator. Mobile shows dots only,
// desktop shows step labels.
// ─────────────────────────────────────────────────────────────────────────────

const PIPELINE_STEPS: { state: AssistantState; label: string; short: string }[] = [
  { state: 'awaiting_client', label: 'Client', short: 'Client' },
  { state: 'awaiting_items', label: 'Items', short: 'Items' },
  { state: 'awaiting_delivery_address', label: 'Address', short: 'Address' },
  { state: 'confirming', label: 'Confirm', short: 'Confirm' },
]

function PipelineProgress({
  state,
  terminal,
}: {
  state: AssistantState
  terminal: boolean
}) {
  const visibleSteps = terminal
    ? [...PIPELINE_STEPS, { state: 'created' as AssistantState, label: 'Done', short: 'Done' }]
    : PIPELINE_STEPS
  const activeIndex = visibleSteps.findIndex((s) => s.state === state)
  const total = visibleSteps.length
  return (
    <div className="flex items-center gap-2 px-1 py-1.5">
      <div className="flex flex-1 items-center">
        {visibleSteps.map((step, i) => {
          const isActive = i === activeIndex
          const isCompleted = i < activeIndex
          return (
            <div key={step.state} className="flex flex-1 items-center last:flex-none">
              <div
                className={cn(
                  'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold transition-colors',
                  isCompleted && 'bg-success text-success-foreground',
                  isActive && 'bg-primary text-primary-foreground ring-4 ring-primary/15',
                  !isCompleted && !isActive && 'bg-muted text-muted-foreground'
                )}
              >
                {isCompleted ? (
                  <CheckCircle2 className="h-3 w-3" />
                ) : (
                  i + 1
                )}
              </div>
              {i < visibleSteps.length - 1 && (
                <div
                  className={cn(
                    'mx-1.5 h-[2px] flex-1 rounded-full transition-colors',
                    i < activeIndex ? 'bg-success' : 'bg-border'
                  )}
                />
              )}
            </div>
          )
        })}
      </div>
      <div className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground tabular-nums">
        {Math.max(1, activeIndex + 1)} / {total}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Body blocks — only render the active step. Used for progressive disclosure.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Render for the client-selection step. The only thing the operator needs
 * to know: name the client (or "is it X?" if a search returned a match).
 */
function ClientBlock({
  draft,
  messages,
}: {
  draft: AssistantDraft
  messages: AssistantMessage[]
}) {
  const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant')
  const head = extractConciseHead(lastAssistant?.content) ?? 'Client name?'
  return (
    <div className="animate-assistant-fade-up rounded-xl border border-border/70 bg-card p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <User className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
            Client
          </p>
          <p className="truncate text-lg font-bold leading-tight text-foreground sm:text-xl">
            {draft.client ? clientDisplayName(draft.client) : head}
          </p>
        </div>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Hold to speak a client name. Answer &quot;yes&quot; or &quot;no&quot; to pick or try again.
      </p>
    </div>
  )
}

/**
 * Composite block for the items / address / confirming states.
 * Previous steps show as compact "locked" chips; the active step fills
 * the rest of the visible area.
 */
function PipelineBody({
  draft,
  state,
  messages,
  error,
}: {
  draft: AssistantDraft
  state: AssistantState
  messages: AssistantMessage[]
  error: string | null
}) {
  return (
    <div className="flex flex-col gap-2 pb-1">
      {/* Locked client chip (compact, single-line). Visible from the
          items step onwards — the client is already locked at that point. */}
      {draft.client && state !== 'awaiting_client' && (
        <LockedChip
          icon={<User className="h-3 w-3" />}
          label="Client"
          value={clientDisplayName(draft.client)}
        />
      )}

      {/* Items block. Visible from items step through to confirming. */}
      {(state === 'awaiting_items' ||
        state === 'awaiting_delivery_address' ||
        state === 'confirming') && <ItemsBlock draft={draft} />}

      {/* Address block. Visible from address step through to confirming. */}
      {(state === 'awaiting_delivery_address' || state === 'confirming') && (
        <AddressBlock draft={draft} />
      )}

      {/* Confirm block. Only on confirming. */}
      {state === 'confirming' && (
        <ConfirmBlock draft={draft} messages={messages} error={error} />
      )}
    </div>
  )
}

function ItemsBlock({ draft }: { draft: AssistantDraft }) {
  const count = draft.items.length
  return (
    <div className="animate-assistant-fade-up rounded-xl border border-border/70 bg-card p-4 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Package className="h-4 w-4" />
          </div>
          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
              Items
            </p>
            <p className="text-sm font-semibold leading-tight text-foreground">
              {count === 0 ? 'No items yet' : `${count} line${count === 1 ? '' : 's'}`}
            </p>
          </div>
        </div>
        <span className="text-base font-bold tabular-nums text-foreground sm:text-lg">
          £{(draft.total ?? 0).toFixed(2)}
        </span>
      </div>
      {count > 0 && (
        <ul className="divide-y divide-border/60">
          {draft.items.map((item, i) => (
            <li
              key={i}
              className="flex items-center justify-between gap-3 py-2 text-sm"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-foreground">
                  {item.product_name}
                </p>
                <p className="text-xs text-muted-foreground tabular-nums">
                  {formatQuantity(item.quantity)} × £
                  {item.price.toFixed(2)}
                </p>
              </div>
              <span className="shrink-0 font-semibold tabular-nums text-foreground">
                £{(item.line_total ?? item.quantity * item.price).toFixed(2)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function AddressBlock({ draft }: { draft: AssistantDraft }) {
  const has = !!draft.deliveryAddress?.line_1
  return (
    <div className="animate-assistant-fade-up rounded-xl border border-border/70 bg-card p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <div
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors',
            has ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'
          )}
        >
          <MapPin className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
            Delivery address
          </p>
          <p
            className={cn(
              'truncate text-sm font-semibold leading-tight',
              has ? 'text-foreground' : 'text-muted-foreground italic'
            )}
          >
            {formatDeliveryAddress(draft.deliveryAddress)}
          </p>
        </div>
      </div>
    </div>
  )
}

function ConfirmBlock({
  draft,
  messages,
  error,
}: {
  draft: AssistantDraft
  messages: AssistantMessage[]
  error: string | null
}) {
  // The LLM often produces a long confirm-prompt with line-by-line totals.
  // Truncate to a single-line headline for the compact mobile view.
  const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant')
  const headline = extractConciseHead(lastAssistant?.content) ?? 'Ready to confirm?'

  return (
    <div className="animate-assistant-fade-up rounded-xl border-2 border-primary/40 bg-primary/5 p-4 shadow-sm">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-medium uppercase tracking-[0.08em] text-primary">
          Confirm
        </span>
        <span className="text-2xl font-bold tabular-nums text-foreground">
          £{(draft.total ?? 0).toFixed(2)}
        </span>
      </div>
      <p className="mt-2 text-base font-semibold leading-tight text-foreground sm:text-lg">
        {headline}
      </p>
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
    </div>
  )
}

function DoneBlock({
  draft,
}: {
  draft: AssistantDraft
}) {
  const invoice = draft.createdInvoice
  return (
    <div className="animate-assistant-fade-up rounded-xl border border-success/40 bg-success/5 p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-success/15 text-success">
          <CheckCircle2 className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-success">
            Invoice created
          </p>
          <p className="truncate text-lg font-bold leading-tight text-foreground">
            {invoice?.document_number
              ? String(invoice.document_number)
              : 'Draft'}
          </p>
        </div>
      </div>
      <p className="mt-3 text-sm text-muted-foreground">
        Hold to share via WhatsApp, email, or download a PDF. Say &quot;next&quot; for a new invoice.
      </p>
    </div>
  )
}

function LockedChip({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: string
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/40 px-3 py-1.5">
      <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-success/15 text-success">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[9px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
          {label}
        </p>
        <p className="truncate text-xs font-semibold leading-tight text-foreground">
          {value}
        </p>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Concise prompt — text shown in the bottom action bar. One-word or short
// fragment so the operator can read it at a glance on a phone screen.
// ─────────────────────────────────────────────────────────────────────────────

interface PromptContext {
  messages: AssistantMessage[]
  state: AssistantState
  draft: AssistantDraft
  pendingIntent: { intent: ParsedIntent } | null
}

function getCurrentPrompt(ctx: PromptContext): string {
  // 1. A captured product intent always wins — the operator needs to
  //    confirm what we heard, regardless of state.
  if (ctx.pendingIntent) {
    return summaryIntentAsPrompt(ctx.pendingIntent.intent)
  }

  // 2. Take a concise fragment from the LLM's latest message when it
  //    fits. Falls through to a hard state-based prompt otherwise.
  const head = extractConciseHead(
    [...ctx.messages].reverse().find((m) => m.role === 'assistant')?.content
  )
  if (head && head.length <= 30) return head

  // 3. State-aware fallbacks. Hard cap of ~16 chars so the bar stays one
  //    line on a 360-px-wide phone screen.
  switch (ctx.state) {
    case 'awaiting_client':
      return 'Client name?'
    case 'awaiting_items':
      return ctx.draft.items.length > 0 ? 'Next item?' : 'What product?'
    case 'awaiting_delivery_address':
      return 'Address?'
    case 'confirming':
      return 'Confirm?'
    case 'created':
      return 'Share or download?'
    case 'done':
      return 'Done.'
    default:
      return ''
  }
}

function summaryIntentAsPrompt(intent: ParsedIntent): string {
  const bits: string[] = []
  if (intent.quantity) {
    bits.push(
      intent.quantity.unit
        ? `${intent.quantity.value} ${intent.quantity.unit}`
        : String(intent.quantity.value)
    )
  }
  if (intent.product) bits.push(intent.product.name)
  if (intent.price) bits.push(`£${intent.price.value.toFixed(2)}`)
  return bits.length > 0 ? `${bits.join(' · ')}?` : 'Confirm?'
}

function formatQuantity(q: number): string {
  return Number.isInteger(q) ? String(q) : q.toString()
}

/**
 * Convert a parsed product intent into the partial line item the assistant
 * server uses as PENDING ITEM. Pre-filling this before the LLM turn locks
 * the captured slots so the model cannot hallucinate a different quantity,
 * unit or price.
 */
function parsedIntentToPendingItem(intent: ParsedIntent): Partial<AssistantLineItem> {
  return {
    product_name: intent.product?.name,
    quantity: intent.quantity?.value,
    unit: intent.quantity?.unit,
    price: intent.price?.value,
  }
}

/**
 * Translate a parsed product intent into a clean English utterance so
 * the LLM receives a precise line instead of a raw transcript.
 *
 * Used when the operator taps Confirm on the ProductIntentCard. Missing
 * slots are dropped — the LLM is told only what we already captured.
 */
function formatIntentAsUtterance(intent: ParsedIntent): string {
  const parts: string[] = []
  if (intent.product) parts.push(intent.product.name)
  if (intent.quantity) {
    const unit = intent.quantity.unit ? ` ${intent.quantity.unit}` : ''
    parts.unshift(`${intent.quantity.value}${unit}`)
  }
  if (intent.price) {
    parts.push(`at £${intent.price.value.toFixed(2)} each`)
  }
  // Prefix with "Add " so the LLM unambiguously routes the message to a
  // single tool call.
  return parts.length > 0 ? `Add ${parts.join(' ')}` : ''
}

/**
 * Natural-language confirmation prompt for hands-free / in-car use.
 * Reads back the captured slots and asks the operator to say yes or no.
 */
function formatIntentAsConfirmationPrompt(intent: ParsedIntent): string {
  const quantityText = intent.quantity
    ? `${intent.quantity.value}${intent.quantity.unit ? ` ${intent.quantity.unit}` : ''}`
    : null
  const priceText = intent.price
    ? intent.price.value < 1
      ? `${Math.round(intent.price.value * 100)} pence`
      : `£${intent.price.value.toFixed(2)}`
    : null

  const pieces: string[] = []
  if (quantityText && intent.product) {
    pieces.push(`${quantityText} ${intent.product.name}`)
  } else if (intent.product) {
    pieces.push(intent.product.name)
  } else if (quantityText) {
    pieces.push(quantityText)
  }

  if (priceText) {
    pieces.push(`at ${priceText} each`)
  }

  const summary = pieces.join(', ')
  if (!summary) return 'Should I confirm?'
  return `I heard ${summary}. Say yes to confirm, or no to cancel.`
}

async function getAccessToken(): Promise<string | null> {
  const supabase = createClient()
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}

async function sendEmail(invoiceId: string, recipient?: string): Promise<boolean> {
  const token = await getAccessToken()
  if (!token) {
    console.error('No session for email send')
    return false
  }
  const res = await fetch('/api/invoices/send-email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ invoiceId, recipientEmail: recipient }),
  })
  if (!res.ok) {
    const payload = (await res.json().catch(() => ({}))) as { error?: string }
    console.error('Email send failed:', payload.error || res.status)
    return false
  }
  return true
}

async function downloadPdf(invoiceId: string, documentNumber?: string): Promise<boolean> {
  const res = await fetch('/api/invoices/pdf', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ invoiceId }),
  })
  if (!res.ok) {
    console.error('PDF download failed:', res.status)
    return false
  }
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = documentNumber
    ? `${documentNumber.replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`
    : 'invoice.pdf'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
  return true
}