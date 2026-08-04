'use client'

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { formatCurrency } from '@/lib/utils'
import {
  FileDown,
  Mail,
  Share2,
  Printer,
  Pencil,
  ArrowRight,
  Check,
  Loader2,
  Info,
  Eye,
} from 'lucide-react'
import { type InvoicePdfProps } from './InvoicePdf'
import { useInvoiceActions } from '@/lib/hooks/use-invoice-actions'
import { ScaledInvoiceDocument } from '@/components/invoices/ScaledInvoiceDocument'
import { PrintOptionsDialog, type PrintDocumentType } from '@/components/invoices/PrintOptionsDialog'
import { DocumentTypeDialog } from '@/components/invoices/DocumentTypeDialog'
import { printPdfBlob } from '@/lib/invoices/print-pdf-browser'

interface InvoiceCreatedActionsProps {
  invoice: InvoicePdfProps['invoice']
  company?: InvoicePdfProps['company']
  bankDetails?: InvoicePdfProps['bankDetails']
  logoSrc?: string | null
  open: boolean
  onBackToEdit: () => void
  onDone: () => void
  /** When false, hide the "Email" action — caller checked the
   *  invoices_send_email permission. Default true so existing call
   *  sites that don't pass it (e.g. tests) keep working. */
  canSendEmail?: boolean
}

export function InvoiceCreatedActions({
  invoice,
  company,
  bankDetails,
  logoSrc,
  open,
  onBackToEdit,
  onDone,
  canSendEmail = true,
}: InvoiceCreatedActionsProps) {
  const [completed, setCompleted] = useState<Set<string>>(new Set())
  const [pdfLoading, setPdfLoading] = useState(false)
  const [pdfError, setPdfError] = useState<string | null>(null)
  const printCancelRef = useRef<(() => void) | null>(null)
  const [printDialogOpen, setPrintDialogOpen] = useState(false)
  const [whatsappTypeDialogOpen, setWhatsappTypeDialogOpen] = useState(false)
  const [downloadDialogOpen, setDownloadDialogOpen] = useState(false)
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  const markComplete = (key: string) => setCompleted((prev) => new Set(prev).add(key))

  useEffect(() => {
    return () => {
      printCancelRef.current?.()
      printCancelRef.current = null
    }
  }, [])

  const actions = useInvoiceActions({
    invoice,
    company,
    bankDetails,
    logoSrc,
    onEmailSent: () => markComplete('email'),
    previewData: { invoice, company, bankDetails, logoSrc },
  })

  async function generatePdfBlob(mode: PrintDocumentType, copies: number): Promise<Blob> {
    // After create the invoice already has a real id. Prefer the authenticated
    // invoiceId path so the PDF reloads company/bank from the DB (same as the
    // invoice detail page). The preview payload path historically stripped
    // company/bank via Zod, which made newly-created PDFs look incomplete.
    const body =
      invoice.id
        ? { invoiceId: invoice.id, mode, copies }
        : {
            preview: { invoice, company, bankDetails, logoSrc },
            mode,
            copies,
          }
    const res = await fetch('/api/invoices/pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const payload = (await res.json().catch(() => ({}))) as { error?: string }
      throw new Error(payload.error || `PDF request failed (${res.status})`)
    }
    return res.blob()
  }

  const handleDownload = async (mode: PrintDocumentType = 'invoice') => {
    if (pdfLoading) return
    setPdfLoading(true)
    setPdfError(null)
    try {
      const blob = await generatePdfBlob(mode, 1)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const suffix = mode === 'delivery-note' ? '_delivery_note' : ''
      a.download = `${invoice.document_number.replace(/[^a-zA-Z0-9_-]/g, '_')}${suffix}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      markComplete('download')
    } catch (err) {
      setPdfError(err instanceof Error ? err.message : 'Failed to generate PDF')
    } finally {
      setPdfLoading(false)
    }
  }

  const handlePreview = async (mode: PrintDocumentType) => {
    if (pdfLoading) return
    setPdfLoading(true)
    setPdfError(null)
    try {
      const blob = await generatePdfBlob(mode, 1)
      if (previewUrl) URL.revokeObjectURL(previewUrl)
      const url = URL.createObjectURL(blob)
      setPreviewUrl(url)
      markComplete('preview')
    } catch (err) {
      setPdfError(err instanceof Error ? err.message : 'Failed to prepare preview')
    } finally {
      setPdfLoading(false)
    }
  }

  const handlePrint = async (mode: PrintDocumentType, copies: number) => {
    if (pdfLoading) return
    setPdfLoading(true)
    setPdfError(null)
    printCancelRef.current?.()
    printCancelRef.current = null
    try {
      // Wait for PDF generation to finish, then open the browser print dialog
      // only once the PDF viewer is ready (see printPdfBlob).
      const blob = await generatePdfBlob(mode, copies)
      await new Promise<void>((resolve, reject) => {
        const { cancel } = printPdfBlob(blob, {
          onPrinted: () => resolve(),
          onError: (err) =>
            reject(err instanceof Error ? err : new Error('Failed to open print dialog')),
        })
        printCancelRef.current = cancel
      })
      markComplete('print')
    } catch (err) {
      setPdfError(err instanceof Error ? err.message : 'Failed to prepare print')
    } finally {
      setPdfLoading(false)
    }
  }

  const wrappedShare = async (target: 'client' | 'driver' = 'client') => {
    await actions.handleShareToGroup(target)
    markComplete('whatsapp')
  }

  const emailLabel =
    actions.emailStatus === 'sending'
      ? 'Sending…'
      : actions.emailStatus === 'sent'
        ? `Sent to ${actions.emailRecipientDisplay || 'client'}`
        : 'Send by Email'

  // Visible actions: Download, Email (optional), WhatsApp, Preview, Print.
  const totalVisibleActions = 4 + (canSendEmail && actions.hasClientEmail ? 1 : 0)
  const allComplete = completed.size >= totalVisibleActions

  const documentTypeLabel = invoice.type === 'quotation' ? 'Quotation' : 'Invoice'

  // Mirror of the dashboard behaviour: when the invoice is fully or
  // partially paid the delivery note no longer makes sense (goods
  // already delivered), so the "Invoice vs Delivery / Picker Note" /
  // "who on WhatsApp" pickers are skipped — Download / Preview / Print
  // jump straight to the invoice and WhatsApp jumps straight to the
  // client.
  const isDelivered = invoice.status === 'paid' || invoice.status === 'partial'

  return (
    <>
      <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onDone() }} className="max-w-2xl">
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {invoice.type === 'quotation' ? 'Quotation' : 'Invoice'} created
            </DialogTitle>
          </DialogHeader>
          <DialogClose onClick={onDone} />

          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Document number:{' '}
              <span className="font-semibold text-gray-900">{invoice.document_number}</span>
              <br />
              Total:{' '}
              <span className="font-semibold text-gray-900">{formatCurrency(invoice.total)}</span>
            </p>

            <ScaledInvoiceDocument
              invoice={invoice}
              company={company}
              bankDetails={bankDetails}
              logoSrc={logoSrc}
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {canSendEmail && actions.hasClientEmail && (
                <Button
                  type="button"
                  variant={completed.has('email') ? 'secondary' : 'outline'}
                  onClick={actions.handleEmailClick}
                  disabled={actions.emailStatus === 'sending'}
                  className="justify-start sm:col-span-2"
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
              <Button
                type="button"
                variant={completed.has('download') ? 'secondary' : 'outline'}
                onClick={() => {
                  if (isDelivered) {
                    void handleDownload('invoice')
                    return
                  }
                  setDownloadDialogOpen(true)
                }}
                disabled={pdfLoading}
                className="justify-start"
              >
                <FileDown className="w-4 h-4 mr-2" />
                {pdfLoading ? 'Generating…' : 'Download'}
              </Button>
              <Button
                type="button"
                variant={completed.has('whatsapp') ? 'secondary' : 'outline'}
                onClick={() => {
                  if (isDelivered) {
                    void wrappedShare('client')
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
                {actions.isSharing ? 'Preparing…' : 'WhatsApp'}
              </Button>
              <Button
                type="button"
                variant={completed.has('preview') ? 'secondary' : 'outline'}
                onClick={() => {
                  if (isDelivered) {
                    void handlePreview('invoice')
                    return
                  }
                  setPreviewDialogOpen(true)
                }}
                disabled={pdfLoading}
                className="justify-start"
              >
                <Eye className="w-4 h-4 mr-2" />
                {pdfLoading ? 'Generating…' : 'Preview'}
              </Button>
              <Button
                type="button"
                variant={completed.has('print') ? 'secondary' : 'outline'}
                onClick={() => {
                  if (isDelivered) {
                    void handlePrint('invoice', 1)
                    return
                  }
                  setPrintDialogOpen(true)
                }}
                disabled={pdfLoading}
                className="justify-start"
              >
                <Printer className="w-4 h-4 mr-2" />
                {pdfLoading ? 'Generating…' : 'Print'}
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

            {(pdfError || actions.emailError) && (
              <Alert variant="destructive">
                <AlertDescription>{pdfError || actions.emailError}</AlertDescription>
              </Alert>
            )}

            {actions.shareFeedback && (
              <Alert variant={actions.shareFeedback.kind === 'error' ? 'destructive' : 'default'}>
                <AlertDescription>
                  <pre className="whitespace-pre-wrap font-sans text-sm">{actions.shareFeedback.text}</pre>
                </AlertDescription>
              </Alert>
            )}

            {allComplete && (
              <p className="text-sm text-green-600 font-medium">
                All actions completed. You can close this window.
              </p>
            )}

            <div className="flex flex-col-reverse sm:flex-row gap-3 pt-2 border-t border-gray-100">
              <Button type="button" variant="outline" onClick={onBackToEdit} className="w-full sm:w-auto">
                <Pencil className="w-4 h-4 mr-2" />
                Back to Edit
              </Button>
              <Button type="button" onClick={onDone} className="w-full sm:w-auto">
                {allComplete ? 'Done' : 'Close'}
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <PrintOptionsDialog
        open={printDialogOpen}
        onOpenChange={setPrintDialogOpen}
        documentTypeLabel={documentTypeLabel}
        onPrint={async (options) => {
          await handlePrint(options.mode, options.copies)
          setPrintDialogOpen(false)
        }}
        loading={pdfLoading}
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
          // Share immediately — no staff/client recipient sub-picker.
          setWhatsappTypeDialogOpen(false)
          await wrappedShare(mode === 'delivery-note' ? 'driver' : 'client')
        }}
      />

      <DocumentTypeDialog
        open={downloadDialogOpen}
        onOpenChange={setDownloadDialogOpen}
        documentTypeLabel={documentTypeLabel}
        title="Download document"
        description="Choose whether to download the full invoice/quotation or just the delivery / picker note."
        actionLabel="Download"
        ActionIcon={FileDown}
        loading={pdfLoading}
        onConfirm={async (mode) => {
          await handleDownload(mode)
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
        loading={pdfLoading}
        onConfirm={async (mode) => {
          setPreviewDialogOpen(false)
          await handlePreview(mode)
        }}
      />

      <Dialog
        open={!!previewUrl && !previewDialogOpen}
        onOpenChange={(isOpen) => {
          if (!isOpen && previewUrl) {
            URL.revokeObjectURL(previewUrl)
            setPreviewUrl(null)
          }
        }}
        className="max-w-4xl p-0 overflow-hidden h-[90vh]"
      >
        <DialogContent className="p-0 flex flex-col h-full">
          <DialogHeader className="px-6 pt-6 pb-2 shrink-0">
            <DialogTitle>Preview {documentTypeLabel}</DialogTitle>
          </DialogHeader>
          <DialogClose
            onClick={() => {
              if (previewUrl) {
                URL.revokeObjectURL(previewUrl)
                setPreviewUrl(null)
              }
            }}
          />
          <div className="flex-1 min-h-0 w-full bg-gray-100">
            {previewUrl && (
              <iframe
                src={previewUrl}
                title="PDF Preview"
                className="w-full h-full border-0"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={actions.emailOverrideOpen} onOpenChange={actions.setEmailOverrideOpen} className="max-w-md">
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send invoice by email</DialogTitle>
            <DialogDescription>
              This client has no email on file. Enter the recipient address for this invoice.
            </DialogDescription>
          </DialogHeader>
          <DialogClose onClick={() => actions.setEmailOverrideOpen(false)} />
          <form onSubmit={actions.handleOverrideSubmit} className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="override-email">Recipient email</Label>
              <Input
                id="override-email"
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

// ScaledInvoiceDocument was extracted to its own module
// (components/invoices/ScaledInvoiceDocument.tsx) so the public share
// view at /invoice/[token] can reuse it for mobile rendering. The
// dashboard import above pulls it in unchanged.
