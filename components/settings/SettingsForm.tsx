'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { updateCompanySettings } from '@/lib/actions/settings'
import { playSuccessSound, playErrorSound } from '@/lib/sound'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Card, CardFooter } from '@/components/ui/card'
import { SettingsSection, Subsection } from './SettingsSection'

interface CompanyPhoneRow {
  id?: string
  value: string
  label: string
  is_primary: boolean
  show_header: boolean
  show_homepage: boolean
  show_contact_page: boolean
  show_footer: boolean
  show_invoice: boolean
  show_email: boolean
  show_auth: boolean
  sort_order: number
}

interface CompanyEmailRow {
  id?: string
  value: string
  label: string
  is_primary: boolean
  show_header: boolean
  show_homepage: boolean
  show_contact_page: boolean
  show_footer: boolean
  show_invoice: boolean
  show_email: boolean
  show_auth: boolean
  sort_order: number
}

interface SettingsFormProps {
  company?: {
    id?: number
    company_name?: string | null
    address_line_1?: string | null
    address_line_2?: string | null
    town?: string | null
    county?: string | null
    postcode?: string | null
    phone?: string | null
    email?: string | null
    vat_number?: string | null
    company_registration_number?: string | null
    invoice_prefix?: string | null
    quotation_prefix?: string | null
    enable_stock_routing?: boolean | null
    email_from_name?: string | null
    email_reply_to?: string | null
    webmail_url?: string | null
    /** Default VAT percentage for new invoices (0–100). */
    default_vat_rate?: number | null
    /** Hours after which a printed load is auto-marked delivered (0 = off). */
    auto_deliver_after_hours?: number | null
    /** Maximum number of loads a single order can be split into. */
    max_loads_per_order?: number | null
    phones?: CompanyPhoneRow[] | null
    emails?: CompanyEmailRow[] | null
  } | null
  bankDetails?: {
    bank_name?: string | null
    bank_account_name?: string | null
    sort_code?: string | null
    account_number?: string | null
  } | null
  canEdit?: boolean
}

const MAX_CHANNELS = 4

const EMPTY_PHONE: CompanyPhoneRow = {
  value: '',
  label: '',
  is_primary: false,
  show_header: true,
  show_homepage: true,
  show_contact_page: true,
  show_footer: true,
  show_invoice: true,
  show_email: true,
  show_auth: true,
  sort_order: 0,
}

const EMPTY_EMAIL: CompanyEmailRow = {
  value: '',
  label: '',
  is_primary: false,
  show_header: true,
  show_homepage: true,
  show_contact_page: true,
  show_footer: true,
  show_invoice: true,
  show_email: true,
  show_auth: true,
  sort_order: 0,
}

function normalizePhoneRows(rows?: CompanyPhoneRow[] | null): CompanyPhoneRow[] {
  if (!Array.isArray(rows) || rows.length === 0) return [{ ...EMPTY_PHONE, is_primary: true }]
  return rows.map((r, i) => ({
    ...r,
    value: r.value ?? '',
    label: r.label ?? '',
    sort_order: r.sort_order ?? i,
  }))
}

function normalizeEmailRows(rows?: CompanyEmailRow[] | null): CompanyEmailRow[] {
  if (!Array.isArray(rows) || rows.length === 0) return [{ ...EMPTY_EMAIL, is_primary: true }]
  return rows.map((r, i) => ({
    ...r,
    value: r.value ?? '',
    label: r.label ?? '',
    sort_order: r.sort_order ?? i,
  }))
}

function ensureOnePrimary<T extends { is_primary: boolean }>(rows: T[]): T[] {
  const hasPrimary = rows.some((r) => r.is_primary)
  if (hasPrimary || rows.length === 0) return rows
  return rows.map((r, i) => (i === 0 ? { ...r, is_primary: true } : r))
}

function setPrimary<T extends { is_primary: boolean }>(rows: T[], index: number): T[] {
  return rows.map((r, i) => ({ ...r, is_primary: i === index }))
}

function sanitizePhoneInput(value: string): string {
  return value.replace(/[^+\d\s()-]/g, '')
}

const CONTEXTS: { key: keyof Omit<CompanyPhoneRow, 'id' | 'value' | 'label' | 'is_primary' | 'sort_order'>; label: string }[] = [
  { key: 'show_header', label: 'Header' },
  { key: 'show_homepage', label: 'Homepage' },
  { key: 'show_contact_page', label: 'Contact page' },
  { key: 'show_footer', label: 'Footer' },
  { key: 'show_invoice', label: 'Invoices' },
  { key: 'show_email', label: 'Emails' },
  { key: 'show_auth', label: 'Auth page' },
]

function serializeChannelIntoFormData(formData: FormData, prefix: 'phones' | 'emails', index: number, row: CompanyPhoneRow | CompanyEmailRow) {
  formData.set(`${prefix}[${index}][id]`, row.id ?? '')
  formData.set(`${prefix}[${index}][value]`, row.value.trim())
  // Labels are optional in the DB and may come back as null; normalize to
  // an empty string before setting the form field.
  formData.set(`${prefix}[${index}][label]`, (row.label ?? '').trim())
  formData.set(`${prefix}[${index}][is_primary]`, row.is_primary ? 'true' : 'false')
  formData.set(`${prefix}[${index}][sort_order]`, String(row.sort_order))
  CONTEXTS.forEach(({ key }) => {
    formData.set(`${prefix}[${index}][${key}]`, (row[key] as boolean) ? 'true' : 'false')
  })
}

export function SettingsForm({ company, bankDetails, canEdit = true }: SettingsFormProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  const [phones, setPhones] = useState<CompanyPhoneRow[]>(() =>
    ensureOnePrimary(normalizePhoneRows(company?.phones)),
  )
  const [emails, setEmails] = useState<CompanyEmailRow[]>(() =>
    ensureOnePrimary(normalizeEmailRows(company?.emails)),
  )
  const [enableStockRouting, setEnableStockRouting] = useState(() =>
    company?.enable_stock_routing ?? false,
  )

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)

    try {
      const formData = new FormData(e.currentTarget)

      // Strip any stale indexed fields that React may have rendered as hidden
      // inputs before we add the authoritative ones.
      Array.from(formData.keys())
        .filter((k) => k.startsWith('phones[') || k.startsWith('emails['))
        .forEach((k) => formData.delete(k))

      // Add current channel state.
      const activePhones = phones.filter((p) => (p.value ?? '').trim().length > 0)
      const activeEmails = emails.filter((em) => (em.value ?? '').trim().length > 0)

      activePhones.forEach((row, i) => serializeChannelIntoFormData(formData, 'phones', i, row))
      activeEmails.forEach((row, i) => serializeChannelIntoFormData(formData, 'emails', i, row))

      const result = await updateCompanySettings(formData)
      if (result?.error) {
        playErrorSound()
        toast.error('Unable to save settings', {
          description: result.error,
        })
      } else if (result?.success) {
        playSuccessSound()
        toast.success('Settings saved', {
          description: 'Your changes have been saved successfully.',
        })
        router.refresh()
      } else {
        playErrorSound()
        toast.error('Unable to save settings', {
          description: 'Unexpected response from server. Please try again.',
        })
      }
    } catch (err) {
      console.error('Settings form submit error:', err)
      let detail = 'Please try again.'
      if (err instanceof Error) {
        detail = err.message
      } else if (err && typeof err === 'object' && 'message' in err) {
        detail = String((err as { message?: unknown }).message)
      }
      playErrorSound()
      toast.error('Something went wrong while saving.', {
        description: detail,
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {!canEdit && (
        <Alert>
          <AlertDescription>You do not have permission to edit company settings.</AlertDescription>
        </Alert>
      )}

      <input type="hidden" name="id" value={company?.id ?? 1} />

      <fieldset disabled={!canEdit || loading} className="space-y-6">

      <SettingsSection
        title="Company profile"
        description="The name, address and contact details that appear on invoices and quotations."
      >
        <div className="space-y-8">
          <Subsection title="Identity" description="Company name shown at the top of invoices and quotations.">
            <div className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="company_name">Company Name *</Label>
                <Input id="company_name" name="company_name" defaultValue={company?.company_name || ''} required />
              </div>

            </div>
          </Subsection>

          <Subsection title="Address" description="Registered or trading address printed on documents.">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="address_line_1">Address Line 1</Label>
                <Input id="address_line_1" name="address_line_1" defaultValue={company?.address_line_1 || ''} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="address_line_2">Address Line 2</Label>
                <Input id="address_line_2" name="address_line_2" defaultValue={company?.address_line_2 || ''} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="town">Town</Label>
                <Input id="town" name="town" defaultValue={company?.town || ''} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="county">County</Label>
                <Input id="county" name="county" defaultValue={company?.county || ''} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="postcode">Postcode</Label>
                <Input id="postcode" name="postcode" defaultValue={company?.postcode || ''} />
              </div>
            </div>
          </Subsection>

          <Subsection title="Phone numbers" description="Up to 4 phone numbers. Choose which surfaces each appears on. The starred number is the primary default.">
            <ChannelEditor
              kind="phone"
              rows={phones}
              onChange={setPhones}
              max={MAX_CHANNELS}
              disabled={!canEdit || loading}
            />
          </Subsection>

          <Subsection title="Email addresses" description="Up to 4 email addresses. Choose which surfaces each appears on. The starred address is the primary default.">
            <ChannelEditor
              kind="email"
              rows={emails}
              onChange={setEmails}
              max={MAX_CHANNELS}
              disabled={!canEdit || loading}
            />
          </Subsection>

          <Subsection title="Tax & registration" description="Official numbers required on invoices and legal documents.">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="vat_number">VAT Number</Label>
                <Input
                  id="vat_number"
                  name="vat_number"
                  defaultValue={company?.vat_number || ''}
                  placeholder="123456789 or GB123456789"
                  maxLength={11}
                  onChange={(e) => {
                    e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '')
                  }}
                />
                <p className="text-xs text-gray-500">UK VAT number: 9 digits, optional GB prefix.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="company_registration_number">Company Registration Number</Label>
                <Input
                  id="company_registration_number"
                  name="company_registration_number"
                  defaultValue={company?.company_registration_number || ''}
                  placeholder="12345678"
                  maxLength={8}
                  onChange={(e) => {
                    e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '')
                  }}
                />
                <p className="text-xs text-gray-500">UK company number: 8 digits (or 2 letters + 6 digits).</p>
              </div>
            </div>
          </Subsection>
        </div>
      </SettingsSection>

      <input type="hidden" name="enable_stock_routing" value={enableStockRouting ? 'true' : 'false'} />

      <SettingsSection
        title="Stock routing"
        description="Enable warehouse stock tracking and automatic stock deductions when invoices are sent."
      >
        <div className="flex items-start justify-between gap-4 rounded-lg border border-border bg-card p-4">
          <div className="space-y-1">
            <Label htmlFor="enable_stock_routing" className="text-base font-medium">
              Enable stock routing
            </Label>
            <p className="text-sm text-muted-foreground">
              When on, products can track stock, invoices deduct stock on send, and picker alerts are raised for out-of-stock items.
            </p>
          </div>
          <Switch
            id="enable_stock_routing"
            checked={enableStockRouting}
            onCheckedChange={setEnableStockRouting}
            disabled={!canEdit || loading}
          />
        </div>
      </SettingsSection>

      <SettingsSection
        title="Document numbering"
        description="Prefixes used when generating invoice and quotation numbers."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="invoice_prefix">Invoice Prefix</Label>
            <Input
              id="invoice_prefix"
              name="invoice_prefix"
              defaultValue={company?.invoice_prefix || 'INV'}
              placeholder="e.g. INV"
              maxLength={10}
            />
            <p className="text-xs text-gray-500">Letters and numbers only.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="quotation_prefix">Quotation Prefix</Label>
            <Input
              id="quotation_prefix"
              name="quotation_prefix"
              defaultValue={company?.quotation_prefix || 'QTE'}
              placeholder="e.g. QTE"
              maxLength={10}
            />
            <p className="text-xs text-gray-500">Letters and numbers only.</p>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection
        title="Bank details"
        description="Payment details shown on invoices so clients know where to pay."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="bank_name">Bank Name</Label>
            <Input id="bank_name" name="bank_name" defaultValue={bankDetails?.bank_name || ''} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="bank_account_name">Account Name</Label>
            <Input id="bank_account_name" name="bank_account_name" defaultValue={bankDetails?.bank_account_name || ''} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sort_code">Sort Code</Label>
            <Input
              id="sort_code"
              name="sort_code"
              defaultValue={bankDetails?.sort_code || ''}
              inputMode="numeric"
              maxLength={8}
              placeholder="12-34-56"
              onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, '').slice(0, 6)
                const formatted = digits.length > 4
                  ? `${digits.slice(0, 2)}-${digits.slice(2, 4)}-${digits.slice(4, 6)}`
                  : digits.length > 2
                    ? `${digits.slice(0, 2)}-${digits.slice(2, 4)}`
                    : digits
                e.target.value = formatted
              }}
            />
            <p className="text-xs text-gray-500">UK format: 6 digits, e.g. 12-34-56.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="account_number">Account Number</Label>
            <Input
              id="account_number"
              name="account_number"
              type="text"
              inputMode="numeric"
              pattern="\d{8}"
              maxLength={8}
              defaultValue={bankDetails?.account_number || ''}
              placeholder="12345678"
              onChange={(e) => {
                e.target.value = e.target.value.replace(/\D/g, '').slice(0, 8)
              }}
            />
            <p className="text-xs text-gray-500">UK format: 8 digits.</p>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection
        title="VAT"
        description="Default VAT rate applied when “Apply VAT” is on for invoices and quotations. Operators can still turn VAT off per document."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="default_vat_rate">Default VAT rate (%)</Label>
            <Input
              id="default_vat_rate"
              name="default_vat_rate"
              type="number"
              inputMode="decimal"
              min={0}
              max={100}
              step={0.01}
              defaultValue={
                company?.default_vat_rate != null && Number.isFinite(Number(company.default_vat_rate))
                  ? String(company.default_vat_rate)
                  : '20'
              }
            />
            <p className="text-xs text-gray-500">
              UK standard rate is 20. Use 0 if you are not VAT-registered (operators can still toggle VAT per document).
            </p>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection
        title="Deliveries"
        description="Once a load is printed it is on the vehicle. If the driver has not confirmed the delivery within this many hours, it is marked delivered automatically."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="auto_deliver_after_hours">Auto-mark delivered after (hours)</Label>
            <Input
              id="auto_deliver_after_hours"
              name="auto_deliver_after_hours"
              type="number"
              inputMode="numeric"
              min={0}
              max={720}
              step={1}
              defaultValue={
                company?.auto_deliver_after_hours != null &&
                Number.isFinite(Number(company.auto_deliver_after_hours))
                  ? String(company.auto_deliver_after_hours)
                  : '24'
              }
            />
            <p className="text-xs text-gray-500">
              Default is 24 hours. Set 0 to turn automatic delivery off — drivers must then confirm every delivery themselves.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="max_loads_per_order">Max loads per order</Label>
            <Input
              id="max_loads_per_order"
              name="max_loads_per_order"
              type="number"
              inputMode="numeric"
              min={1}
              max={50}
              step={1}
              defaultValue={
                company?.max_loads_per_order != null &&
                Number.isFinite(Number(company.max_loads_per_order))
                  ? String(company.max_loads_per_order)
                  : '5'
              }
            />
            <p className="text-xs text-gray-500">
              Default is 5. Limits how many loads a single order can be split into — applies to both the picker app and the office load tools.
            </p>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection
        title="Client sharing"
        description="Sender name and reply-to address used when sharing documents with clients."
      >
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="email_from_name">Email From Name</Label>
              <Input
                id="email_from_name"
                name="email_from_name"
                defaultValue={company?.email_from_name || company?.company_name || 'Star Hawk Builders Merchant'}
                placeholder="Star Hawk Builders Merchant"
              />
              <p className="text-xs text-gray-500">Display name clients see in their inbox.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="email_reply_to">Email Reply-To</Label>
              <Input
                id="email_reply_to"
                name="email_reply_to"
                type="email"
                defaultValue={company?.email_reply_to || company?.email || ''}
                placeholder="starhawk.merchants@gmail.com"
              />
              <p className="text-xs text-gray-500">Where client replies go.</p>
            </div>
          </div>

        </div>
      </SettingsSection>

      <SettingsSection
        title="Quick links"
        description="One-click shortcuts to external tools the team uses. The Emails shortcut opens your webmail in a new tab."
      >
        <div className="space-y-2">
          <Label htmlFor="webmail_url">Webmail URL</Label>
          <Input
            id="webmail_url"
            name="webmail_url"
            type="url"
            defaultValue={company?.webmail_url || ''}
            placeholder="https://outlook.office365.com"
          />
          <p className="text-xs text-gray-500">
            Where the <strong>Emails</strong> sidebar item sends you. Paste the URL of your webmail
            (Outlook on the web, Gmail, GoDaddy webmail, etc.). Must start with https://.
          </p>
          {company?.webmail_url && (
            <p className="text-xs text-muted-foreground pt-1">
              <a
                href={company.webmail_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                Test current link ↗
              </a>
            </p>
          )}
        </div>
      </SettingsSection>

      </fieldset>

      {canEdit && (
        <Card>
          <CardFooter className="flex items-center justify-between gap-4 py-4">
            <p className="text-sm text-gray-500">
              Changes apply immediately to new invoices and quotations.
            </p>
            <Button type="submit" disabled={loading}>
              {loading ? 'Saving...' : 'Save Settings'}
            </Button>
          </CardFooter>
        </Card>
      )}
    </form>
  )
}

interface ChannelEditorProps<T extends CompanyPhoneRow | CompanyEmailRow> {
  kind: 'phone' | 'email'
  rows: T[]
  onChange: (rows: T[]) => void
  max: number
  disabled?: boolean
}

function ChannelEditor<T extends CompanyPhoneRow | CompanyEmailRow>({
  kind,
  rows,
  onChange,
  max,
  disabled = false,
}: ChannelEditorProps<T>) {
  const valueInputType = kind === 'phone' ? 'tel' : 'email'
  const valuePlaceholder = kind === 'phone' ? '07496 185 969' : 'trade@starhawkbm.com'
  const labelPlaceholder = kind === 'phone' ? 'Trade counter' : 'Sales'

  const updateRow = (index: number, patch: Partial<T>) => {
    const next = rows.map((row, i) => (i === index ? { ...row, ...patch } : row)) as T[]
    onChange(next)
  }

  const setPrimaryAt = (index: number) => {
    onChange(setPrimary(rows, index) as T[])
  }

  const removeRow = (index: number) => {
    const next = rows.filter((_, i) => i !== index) as T[]
    onChange(ensureOnePrimary(next))
  }

  const addRow = () => {
    if (rows.length >= max) return
    const empty = (kind === 'phone' ? { ...EMPTY_PHONE } : { ...EMPTY_EMAIL }) as T
    empty.sort_order = rows.length
    onChange([...rows, empty])
  }

  return (
    <div className="space-y-4">
      {rows.map((row, index) => (
        <div
          key={`${kind}-${index}-${row.id ?? 'new'}`}
          className="rounded-lg border border-border bg-card p-4 space-y-4"
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <div className="flex-1 space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">{kind === 'phone' ? 'Phone number' : 'Email address'}</Label>
                  <Input
                    type={valueInputType}
                    inputMode={kind === 'phone' ? 'tel' : 'email'}
                    value={row.value}
                    placeholder={valuePlaceholder}
                    disabled={disabled}
                    onChange={(e) => {
                      const value = kind === 'phone' ? sanitizePhoneInput(e.target.value) : e.target.value
                      updateRow(index, { value } as Partial<T>)
                    }}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Label</Label>
                  <Input
                    value={row.label}
                    placeholder={labelPlaceholder}
                    disabled={disabled}
                    onChange={(e) => updateRow(index, { label: e.target.value } as Partial<T>)}
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground">Show on:</span>
                {CONTEXTS.map(({ key, label }) => (
                  <label
                    key={key}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-xs"
                  >
                    <Switch
                      checked={row[key] as boolean}
                      disabled={disabled}
                      onCheckedChange={(checked) => updateRow(index, { [key]: checked } as Partial<T>)}
                      className="scale-75 origin-left"
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2 sm:flex-col sm:items-end">
              <Button
                type="button"
                variant={row.is_primary ? 'primary' : 'outline'}
                size="sm"
                disabled={disabled}
                onClick={() => setPrimaryAt(index)}
                title="Set as primary"
              >
                {row.is_primary ? 'Primary' : 'Set primary'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={disabled || rows.length <= 1}
                onClick={() => removeRow(index)}
              >
                Remove
              </Button>
            </div>
          </div>
        </div>
      ))}

      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={disabled || rows.length >= max}
        onClick={addRow}
      >
        Add {kind === 'phone' ? 'phone number' : 'email address'}
      </Button>
      {rows.length >= max && (
        <p className="text-xs text-muted-foreground">Maximum of {max} {kind === 'phone' ? 'phone numbers' : 'email addresses'} reached.</p>
      )}
    </div>
  )
}
