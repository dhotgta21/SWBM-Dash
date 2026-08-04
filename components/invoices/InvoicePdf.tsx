'use client'

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from '@/components/ui/dialog'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FileDown, Mail, Share2, Loader2, Printer, Check, Info, Eye } from 'lucide-react'
import { useInvoiceActions } from '@/lib/hooks/use-invoice-actions'
import { PrintOptionsDialog, type PrintDocumentType } from '@/components/invoices/PrintOptionsDialog'
import { DocumentTypeDialog } from '@/components/invoices/DocumentTypeDialog'
import { type InvoicePdfProps } from '@/components/invoices/InvoicePdfTemplate'

export type { InvoicePdfProps }

export function InvoicePdfActions({
  invoice,
  company,
  bankDetails,
  logoSrc,
  canSendEmail = true,
}: InvoicePdfProps & { canSendEmail?: boolean }) {
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const revokedRef = useRef<string | null>(null)
  const [printDialogOpen, setPrintDialogOpen] = useState(false)
  const [whatsappTypeDialogOpen, setWhatsappTypeDialogOpen] = useState(false)
  const [downloadDialogOpen, setDownloadDialogOpen] = useState(false)
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false)
  const [previewMode, setPreviewMode] = useState<PrintDocumentType>('invoice')

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!previewOpen) {
      if (revokedRef.current) {
        URL.revokeObjectURL(revokedRef.current)
        revokedRef.current = null
      }
      setPreviewUrl(null)
      setPreviewError(null)
      return
    }

    if (!invoice.id) {
      setPreviewLoading(false)
      return
    }

    let cancelled = false
    setPreviewLoading(true)
    setPreviewError(null)
    fetchPdfBlob(invoice.id, previewMode)
      .then((blob) => {
        if (cancelled) return
        const url = URL.createObjectURL(blob)
        revokedRef.current = url
        setPreviewUrl(url)
      })
      .catch((err) => {
        console.error('Failed to generate PDF preview:', err)
        if (!cancelled) {
          setPreviewUrl(null)
          setPreviewError(err instanceof Error ? err.message : 'Failed to generate preview')
        }
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [previewOpen, invoice, previewMode])
  /* eslint-enable react-hooks/set-state-in-effect */

  const actions = useInvoiceActions({ invoice, company, bankDetails, logoSrc, preferAuthenticated: true })

  const emailLabel =
    actions.emailStatus === 'sending'
      ? 'Sending…'
      : actions.emailStatus === 'sent'
        ? `Sent to ${actions.emailRecipientDisplay || 'client'}`
        : 'Email PDF'

  const documentTypeLabel = invoice.type === 'quotation' ? 'Quotation' : 'Invoice'

  // When the invoice is fully or partially paid the goods have already
  // been delivered, so the "Invoice vs Delivery / Picker Note" picker is
  // pointless — the delivery note is for the dispatch step, not for an
  // invoice that's already been settled. In that state we skip the
  // DocumentTypeDialog and the "who on WhatsApp" picker, and go straight
  // to the invoice (Download / Preview / Print) or to the Client share.
  const isDelivered = invoice.status === 'paid' || invoice.status === 'partial'

  const handlePrint = async (options: { mode: PrintDocumentType; copies: number }) => {
    await actions.handlePrint(options.mode, options.copies)
    setPrintDialogOpen(false)
  }

  return (
    <>
      <div className="space-y-3">
        {canSendEmail && actions.hasClientEmail && (
          <Button
            type="button"
            variant="outline"
            onClick={actions.handleEmailClick}
            disabled={actions.emailStatus === 'sending'}
            className="w-full justify-start"
          >
            {actions.emailStatus === 'sent' ? (
              <Check className="w-4 h-4 mr-2 text-green-600" />
            ) : actions.emailStatus === 'sending' ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Mail className="w-4 h-4 mr-2" />
            )}
            {emailLabel}
          </Button>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              if (isDelivered) {
                // Paid / partial — bypass the type-picker dialog, go straight
                // to the full invoice PDF.
                void actions.handleDownload('invoice')
                return
              }
              setDownloadDialogOpen(true)
            }}
            disabled={actions.isDownloading}
            className="justify-start"
          >
            <FileDown className="w-4 h-4 mr-2" />
            {actions.isDownloading ? 'Generating…' : 'Download'}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              if (isDelivered) {
                // Paid / partial — share with the client only (no need to
                // pick driver/staff since the delivery note no longer applies).
                void actions.handleShareToGroup('client')
                return
              }
              setWhatsappTypeDialogOpen(true)
            }}
            disabled={
              actions.isSharing ||
              (!invoice.public_share_key && !invoice.share_token) ||
              (invoice.public_share_enabled === false &&
                invoice.delivery_note_share_enabled === false) ||
              !!(invoice.share_token_expires_at && new Date(invoice.share_token_expires_at) < new Date())
            }
            className="justify-start"
          >
            <Share2 className="w-4 h-4 mr-2" />
            {actions.isSharing ? 'Preparing…' : actions.shareButtonLabel}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              if (isDelivered) {
                // Paid / partial — open the invoice preview directly, no
                // type picker.
                setPreviewMode('invoice')
                setPreviewOpen(true)
                return
              }
              setPreviewDialogOpen(true)
            }}
            className="justify-start"
          >
            <Eye className="w-4 h-4 mr-2" />
            Preview
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              if (isDelivered) {
                // Paid / partial — print the invoice directly, skip the
                // print options dialog entirely.
                void actions.handlePrint('invoice', 1)
                return
              }
              setPrintDialogOpen(true)
            }}
            disabled={actions.isPrinting}
            className="justify-start"
          >
            <Printer className="w-4 h-4 mr-2" />
            {actions.isPrinting ? 'Preparing…' : 'Print'}
          </Button>
        </div>

        {canSendEmail && !actions.hasClientEmail && (
          <Alert variant="default" className="bg-muted/50 border-border text-muted-foreground">
            <Info className="h-4 w-4" />
            <AlertDescription>
              Add a client email to send this document by email.
            </AlertDescription>
          </Alert>
        )}

        {actions.emailError && (
          <Alert variant="destructive">
            <AlertDescription>{actions.emailError}</AlertDescription>
          </Alert>
        )}

        {actions.shareFeedback && (
          <Alert variant={actions.shareFeedback.kind === 'error' ? 'destructive' : 'default'}>
            <AlertDescription>
              <pre className="whitespace-pre-wrap font-sans text-sm">{actions.shareFeedback.text}</pre>
            </AlertDescription>
          </Alert>
        )}
      </div>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen} className="max-w-4xl p-0 overflow-hidden h-[90vh]">
        <DialogContent className="p-0 flex flex-col h-full">
          <DialogHeader className="px-6 pt-6 pb-2 shrink-0">
            <DialogTitle>
              Preview {previewMode === 'delivery-note' ? 'Delivery Note' : documentTypeLabel}
            </DialogTitle>
          </DialogHeader>
          <DialogClose onClick={() => setPreviewOpen(false)} />
          <div className="flex-1 min-h-0 w-full bg-gray-100 flex items-center justify-center">
            {previewError ? (
              <div className="text-red-600 text-sm px-6">{previewError}</div>
            ) : previewLoading || !previewUrl ? (
              <div className="flex items-center gap-2 text-gray-500">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Generating preview…</span>
              </div>
            ) : (
              <iframe
                src={previewUrl}
                title="PDF Preview"
                className="w-full h-full border-0"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>

      <PrintOptionsDialog
        open={printDialogOpen}
        onOpenChange={setPrintDialogOpen}
        documentTypeLabel={documentTypeLabel}
        onPrint={handlePrint}
        loading={actions.isPrinting}
      />

      <DocumentTypeDialog
        open={downloadDialogOpen}
        onOpenChange={setDownloadDialogOpen}
        documentTypeLabel={documentTypeLabel}
        title="Download document"
        description="Choose whether to download the full invoice/quotation or just the delivery / picker note."
        actionLabel="Download"
        ActionIcon={FileDown}
        loading={actions.isDownloading}
        onConfirm={async (mode) => {
          await actions.handleDownload(mode)
          setDownloadDialogOpen(false)
        }}
      />

      <DocumentTypeDialog
        open={previewDialogOpen}
        onOpenChange={setPreviewDialogOpen}
        documentTypeLabel={documentTypeLabel}
        title="Preview document"
        description="Choose which document to open in the preview viewer."
        actionLabel="Open preview"
        ActionIcon={Eye}
        onConfirm={(mode) => {
          setPreviewMode(mode)
          setPreviewDialogOpen(false)
          setPreviewOpen(true)
        }}
      />

      <DocumentTypeDialog
        open={whatsappTypeDialogOpen}
        onOpenChange={setWhatsappTypeDialogOpen}
        documentTypeLabel={documentTypeLabel}
        title="Share via WhatsApp"
        description="Choose whether to share the full invoice/quotation or just the delivery / picker note."
        actionLabel="Share"
        ActionIcon={Share2}
        loading={actions.isSharing}
        onConfirm={async (mode) => {
          // Share immediately with the right link — no staff/client/driver
          // recipient picker. Invoice/quotation → client link; delivery note
          // → driver/delivery-note link (same pattern as Download/Preview).
          setWhatsappTypeDialogOpen(false)
          await actions.handleShareToGroup(mode === 'delivery-note' ? 'driver' : 'client')
        }}
      />

      <Dialog open={actions.emailOverrideOpen} onOpenChange={actions.setEmailOverrideOpen} className="max-w-md">
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send invoice by email</DialogTitle>
          </DialogHeader>
          <DialogClose onClick={() => actions.setEmailOverrideOpen(false)} />
          <form onSubmit={actions.handleOverrideSubmit} className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="detail-override-email">Recipient email</Label>
              <Input
                id="detail-override-email"
                type="email"
                value={actions.overrideEmail}
                onChange={(e) => actions.setOverrideEmail(e.target.value)}
                placeholder="client@example.com"
                autoFocus
              />
            </div>
            {actions.emailError && (
              <Alert variant="destructive">
                <AlertDescription>{actions.emailError}</AlertDescription>
              </Alert>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => actions.setEmailOverrideOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">Send</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

    </>
  )
}

async function fetchPdfBlob(
  invoiceId: string,
  mode: PrintDocumentType = 'invoice',
): Promise<Blob> {
  const res = await fetch('/api/invoices/pdf', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ invoiceId, mode, copies: 1 }),
  })
  if (!res.ok) {
    const payload = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(payload.error || `PDF request failed (${res.status})`)
  }
  return res.blob()
}
