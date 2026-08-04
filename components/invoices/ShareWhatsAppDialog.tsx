'use client'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from '@/components/ui/dialog'
import { Loader2, User, Users, Truck } from 'lucide-react'
import { SelectableOptionCard } from '@/components/invoices/SelectableOptionCard'
import { type PrintDocumentType } from '@/components/invoices/PrintOptionsDialog'

export type WhatsAppShareTarget = 'client' | 'staff' | 'driver'

interface ShareWhatsAppDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onShare: (target: WhatsAppShareTarget) => Promise<void>
  loading?: boolean
  /**
   * Which document is being shared. Filters the recipient list so the
   * options match what the document is actually for — mirroring the
   * "Invoice vs Delivery / Picker Note" picker used by Download /
   * Preview / Print. If omitted, all three recipients are shown
   * (back-compat for tests / edge cases).
   */
  documentType?: PrintDocumentType
  /**
   * "Invoice" or "Quotation" — used to adapt the option copy when
   * `documentType === 'invoice'`. Defaults to "Invoice".
   */
  documentTypeLabel?: string
}

interface RecipientSpec {
  target: WhatsAppShareTarget
  icon: typeof User
  title: string
  description: string
}

// Which recipients make sense for each document type. We keep "Staff"
// for both (the team may need either link) and only show "Driver" for
// delivery / picker notes (the driver has no use for a quote) and
// "Client" for the actual invoice/quotation (the client already gets
// the invoice copy by email — sharing the same link to the group is
// what staff need to see).
const RECIPIENTS_BY_DOC_TYPE: Record<PrintDocumentType, RecipientSpec[]> = {
  invoice: [
    {
      target: 'client',
      icon: User,
      title: 'Client',
      description: 'Send the invoice/quotation link to the client',
    },
    {
      target: 'staff',
      icon: Users,
      title: 'Staff',
      description: 'Share internally with the team',
    },
  ],
  'delivery-note': [
    {
      target: 'driver',
      icon: Truck,
      title: 'Driver',
      description: 'Send delivery/picker note link to the driver',
    },
    {
      target: 'staff',
      icon: Users,
      title: 'Staff',
      description: 'Share internally with the team',
    },
  ],
}

const ALL_RECIPIENTS: RecipientSpec[] = [
  {
    target: 'client',
    icon: User,
    title: 'Client',
    description: 'Send invoice/quotation link to the client',
  },
  {
    target: 'staff',
    icon: Users,
    title: 'Staff',
    description: 'Share internally with the team',
  },
  {
    target: 'driver',
    icon: Truck,
    title: 'Driver',
    description: 'Send delivery/picker note link to the driver',
  },
]

export function ShareWhatsAppDialog({
  open,
  onOpenChange,
  onShare,
  loading = false,
  documentType,
  documentTypeLabel = 'Invoice',
}: ShareWhatsAppDialogProps) {
  const recipients = documentType
    ? RECIPIENTS_BY_DOC_TYPE[documentType].map((spec) => {
        // Adapt the Client copy when sharing a quotation so the helper
        // text matches the document the user actually picked.
        if (spec.target === 'client' && documentTypeLabel.toLowerCase() === 'quotation') {
          return {
            ...spec,
            description: 'Send the quotation link to the client',
          }
        }
        return spec
      })
    : ALL_RECIPIENTS

  const titleSuffix = documentType
    ? documentType === 'delivery-note'
      ? ' the delivery / picker note'
      : ` the ${documentTypeLabel.toLowerCase()}`
    : ' this document'
  const description = `Choose who you want to send${titleSuffix} to.`

  return (
    <Dialog open={open} onOpenChange={onOpenChange} className="max-w-sm">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Share via WhatsApp</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogClose onClick={() => onOpenChange(false)} />

        <div className="grid gap-3">
          {recipients.map((spec) => (
            <SelectableOptionCard
              key={spec.target}
              icon={spec.icon}
              title={spec.title}
              description={spec.description}
              onClick={() => void onShare(spec.target)}
              disabled={loading}
            />
          ))}
        </div>

        {loading && (
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground pt-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Preparing message…</span>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
