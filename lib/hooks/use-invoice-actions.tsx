'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { isLikelyValidEmail } from '@/lib/utils'
import { type InvoicePdfProps } from '@/components/invoices/InvoicePdfTemplate'
import { buildWhatsAppShareText, type WhatsAppShareTarget } from '@/lib/email/whatsapp-message'
import { buildInvoiceShareUrlClient, buildDeliveryNoteShareUrlClient } from '@/lib/share/invoice-url-client'
import { type PrintDocumentType } from '@/components/invoices/PrintOptionsDialog'
import { printPdfBlob } from '@/lib/invoices/print-pdf-browser'

export type EmailStatus = 'idle' | 'sending' | 'sent' | 'error'

type CopyState = 'idle' | 'copied' | 'error'

export interface UseInvoiceActionsOptions {
  invoice: InvoicePdfProps['invoice']
  company?: InvoicePdfProps['company']
  bankDetails?: InvoicePdfProps['bankDetails']
  logoSrc?: string | null
  onEmailSent?: () => void
  /**
   * When provided, email/Download/Print are rendered from this preview
   * payload instead of round-tripping through the database. Used right
   * after an invoice is created, before any DB/env issues can interfere.
   */
  previewData?: InvoicePdfProps
  /**
   * Use the authenticated session for PDF/Print instead of the public
   * share-token path. Use this in the dashboard where the user is logged
   * in, so these actions keep working even if the service-role key is not
   * configured.
   */
  preferAuthenticated?: boolean
}

export interface UseInvoiceActionsReturn {
  emailStatus: EmailStatus
  emailError: string | null
  emailOverrideOpen: boolean
  overrideEmail: string
  setOverrideEmail: (value: string) => void
  setEmailOverrideOpen: (open: boolean) => void
  emailRecipientDisplay: string | null
  shareFeedback: { kind: 'info' | 'error'; text: string } | null
  copyState: CopyState
  isSharing: boolean
  isPrinting: boolean
  isDownloading: boolean
  filename: string
  hasClientEmail: boolean
  shareButtonLabel: string
  handleShareToGroup: (target?: WhatsAppShareTarget) => Promise<void>
  handleCopyLink: () => Promise<void>
  handleEmailClick: () => void
  handleOverrideSubmit: (e: React.FormEvent) => void
  handlePrint: (mode?: PrintDocumentType, copies?: number) => Promise<void>
  handleDownload: (mode?: PrintDocumentType) => Promise<void>
  sendEmailTo: (recipient: string) => Promise<void>
}

async function getAccessToken(): Promise<string | null> {
  const supabase = createClient()
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}

async function fetchPdfBlob(
  invoiceId: string,
  token: string | null | undefined,
  mode: PrintDocumentType,
  copies: number
): Promise<Blob> {
  const res = await fetch('/api/invoices/pdf', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      invoiceId,
      shareToken: token ?? undefined,
      mode,
      copies,
    }),
  })
  if (!res.ok) {
    const payload = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(payload.error || `PDF request failed (${res.status})`)
  }
  return res.blob()
}

export function useInvoiceActions(options: UseInvoiceActionsOptions): UseInvoiceActionsReturn {
  const { invoice, company, onEmailSent, previewData, preferAuthenticated } = options
  const [emailStatus, setEmailStatus] = useState<EmailStatus>('idle')
  const [emailError, setEmailError] = useState<string | null>(null)
  const [emailOverrideOpen, setEmailOverrideOpen] = useState(false)
  const [overrideEmail, setOverrideEmail] = useState('')
  const [emailRecipientDisplay, setEmailRecipientDisplay] = useState<string | null>(null)

  const [shareFeedback, setShareFeedback] = useState<{ kind: 'info' | 'error'; text: string } | null>(null)
  const [copyState, setCopyState] = useState<CopyState>('idle')

  const [isSharing, setIsSharing] = useState(false)
  const [isPrinting, setIsPrinting] = useState(false)
  const [isDownloading, setIsDownloading] = useState(false)
  const printCancelRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    return () => {
      printCancelRef.current?.()
      printCancelRef.current = null
    }
  }, [])

  const filename = useMemo(
    () => `${invoice.document_number.replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`,
    [invoice.document_number]
  )

  const client = Array.isArray(invoice.clients) ? invoice.clients[0] : invoice.clients
  const hasClientEmail = !!client?.email?.trim()

  const shareButtonLabel = 'WhatsApp'

  function isShareLinkExpired(): boolean {
    if (!invoice.share_token_expires_at) return false
    return new Date(invoice.share_token_expires_at) < new Date()
  }

  function activeShareToken(forMode: 'invoice' | 'delivery-note' = 'invoice'): string | null {
    if (isShareLinkExpired()) return null
    if (forMode === 'delivery-note') {
      // delivery_note_share_enabled may be undefined on older loaded rows;
      // fall back to invoice flag only when the DN column is absent.
      const dnEnabled =
        invoice.delivery_note_share_enabled !== undefined
          ? invoice.delivery_note_share_enabled !== false
          : invoice.public_share_enabled !== false
      if (!dnEnabled) return null
    } else if (invoice.public_share_enabled === false) {
      return null
    }
    return invoice.public_share_key || invoice.share_token || null
  }

  function resolveShareUrl(): string | null {
    const token = activeShareToken('invoice')
    if (!token) return null
    try {
      return buildInvoiceShareUrlClient(token)
    } catch {
      return null
    }
  }

  function resolveDeliveryNoteShareUrl(): string | null {
    const token = activeShareToken('delivery-note')
    if (!token) return null
    try {
      return buildDeliveryNoteShareUrlClient(token)
    } catch {
      return null
    }
  }

  async function handleShareToGroup(target: WhatsAppShareTarget = 'client') {
    if (isSharing) return
    setIsSharing(true)
    setShareFeedback(null)
    try {
      const shareUrl =
        target === 'driver'
          ? resolveDeliveryNoteShareUrl()
          : resolveShareUrl()
      const text = buildWhatsAppShareText({
        target,
        invoice: {
          document_number: invoice.document_number,
          type: invoice.type,
          total: typeof invoice.total === 'number' ? invoice.total : null,
          operator_name: invoice.operator_name ?? null,
          delivery_address_line_1: invoice.delivery_address_line_1 ?? null,
          delivery_address_line_2: invoice.delivery_address_line_2 ?? null,
          delivery_town: invoice.delivery_town ?? null,
          delivery_county: invoice.delivery_county ?? null,
          delivery_postcode: invoice.delivery_postcode ?? null,
          issue_date: invoice.issue_date,
        },
        client: {
          first_name: client?.first_name ?? null,
          last_name: client?.last_name ?? null,
          company_name: client?.company_name ?? null,
        },
        shareUrl,
      })
      if (shareUrl) {
        const waLink = `https://wa.me/?text=${encodeURIComponent(text)}`
        window.open(waLink, '_blank', 'noopener,noreferrer')
        setShareFeedback({
          kind: 'info',
          text: `WhatsApp opened with the message pre-filled. Hit send in the chat.\n\nMessage draft:\n\n${text}`,
        })
      } else {
        setShareFeedback({
          kind: 'error',
          text: 'No share link available. Open the invoice in the dashboard to regenerate.',
        })
      }
    } catch (err) {
      console.error('Share failed:', err)
      setShareFeedback({ kind: 'error', text: err instanceof Error ? err.message : 'Failed to share' })
    } finally {
      setIsSharing(false)
    }
  }

  async function handleCopyLink() {
    setCopyState('idle')
    const url = resolveShareUrl()
    if (!url) {
      setCopyState('error')
      return
    }
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(url)
      } else {
        const ta = document.createElement('textarea')
        ta.value = url
        ta.setAttribute('readonly', '')
        ta.style.position = 'absolute'
        ta.style.left = '-9999px'
        document.body.appendChild(ta)
        ta.select()
        document.execCommand('copy')
        ta.remove()
      }
      setCopyState('copied')
      setTimeout(() => setCopyState('idle'), 2000)
    } catch (err) {
      console.error('Copy failed:', err)
      setCopyState('error')
    }
  }

  async function sendEmailTo(recipient: string) {
    if (!previewData && !invoice.id) {
      setEmailStatus('error')
      setEmailError('Invoice has not been saved yet')
      return
    }

    setEmailStatus('sending')
    setEmailError(null)
    setEmailRecipientDisplay(recipient)
    try {
      const token = await getAccessToken()
      if (!token) {
        throw new Error('You are not signed in')
      }

      const body = previewData
        ? { preview: previewData, recipientEmail: recipient }
        : { invoiceId: invoice.id, recipientEmail: recipient }

      const res = await fetch('/api/invoices/send-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      })

      const payload = (await res.json().catch(() => ({}))) as { error?: string; id?: string }
      if (!res.ok) {
        throw new Error(payload.error || `Email send failed (${res.status})`)
      }

      setEmailStatus('sent')
      onEmailSent?.()
    } catch (err) {
      setEmailStatus('error')
      setEmailError(err instanceof Error ? err.message : 'Failed to send email')
    }
  }

  function handleEmailClick() {
    if (emailStatus === 'sending') return
    setEmailError(null)
    if (hasClientEmail && client?.email) {
      void sendEmailTo(client.email.trim())
    } else {
      setOverrideEmail('')
      setEmailOverrideOpen(true)
    }
  }

  function handleOverrideSubmit(e: React.FormEvent) {
    e.preventDefault()
    const value = overrideEmail.trim()
    if (!value) {
      setEmailError('Please enter an email address')
      return
    }
    if (!isLikelyValidEmail(value)) {
      setEmailError('That email address doesn’t look right')
      return
    }
    setEmailOverrideOpen(false)
    void sendEmailTo(value)
  }

  async function handlePrint(mode: PrintDocumentType = 'invoice', copies = 1) {
    if (isPrinting || !invoice.id) return
    setIsPrinting(true)
    setEmailError(null)
    // Cancel any in-flight print frame before starting a new one.
    printCancelRef.current?.()
    printCancelRef.current = null
    try {
      const token = preferAuthenticated ? null : activeShareToken()
      // Wait for the server to finish generating the PDF before opening print.
      const blob = await fetchPdfBlob(invoice.id, token, mode, copies)
      await new Promise<void>((resolve, reject) => {
        const { cancel } = printPdfBlob(blob, {
          onPrinted: () => resolve(),
          onError: (err) => reject(err instanceof Error ? err : new Error('Print failed')),
        })
        printCancelRef.current = cancel
      })
    } catch (err) {
      console.error('Print failed:', err)
      setEmailError(err instanceof Error ? err.message : 'Failed to prepare print')
    } finally {
      setIsPrinting(false)
    }
  }

  async function handleDownload(mode: PrintDocumentType = 'invoice') {
    if (isDownloading || !invoice.id) return
    setIsDownloading(true)
    try {
      const token = preferAuthenticated ? null : activeShareToken()
      const blob = await fetchPdfBlob(invoice.id, token, mode, 1)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const suffix = mode === 'delivery-note' ? '_delivery_note' : ''
      a.download = `${invoice.document_number.replace(/[^a-zA-Z0-9_-]/g, '_')}${suffix}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Download failed:', err)
      setEmailError(err instanceof Error ? err.message : 'Failed to download PDF')
    } finally {
      setIsDownloading(false)
    }
  }

  return {
    emailStatus,
    emailError,
    emailOverrideOpen,
    overrideEmail,
    setOverrideEmail,
    setEmailOverrideOpen,
    emailRecipientDisplay,
    shareFeedback,
    copyState,
    isSharing,
    isPrinting,
    isDownloading,
    filename,
    hasClientEmail,
    shareButtonLabel,
    handleShareToGroup,
    handleCopyLink,
    handleEmailClick,
    handleOverrideSubmit,
    handlePrint,
    handleDownload,
    sendEmailTo,
  }
}
