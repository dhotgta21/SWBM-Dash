import { createClient } from '@/lib/supabase/server'

interface DocumentPrefixes {
  invoicePrefix: string
  quotationPrefix: string
}

const FALLBACK: DocumentPrefixes = {
  invoicePrefix: 'INV',
  quotationPrefix: 'QTE',
}

export async function getDocumentPrefixes(): Promise<DocumentPrefixes> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('company_settings')
    .select('invoice_prefix, quotation_prefix')
    .maybeSingle()

  if (error || !data) {
    return FALLBACK
  }

  return {
    invoicePrefix: sanitizePrefix(data.invoice_prefix) || FALLBACK.invoicePrefix,
    quotationPrefix: sanitizePrefix(data.quotation_prefix) || FALLBACK.quotationPrefix,
  }
}

function sanitizePrefix(value: string | null | undefined): string {
  return (value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
}

export function getPrefixForType(type: 'invoice' | 'quotation', prefixes: DocumentPrefixes): string {
  return type === 'invoice' ? prefixes.invoicePrefix : prefixes.quotationPrefix
}
