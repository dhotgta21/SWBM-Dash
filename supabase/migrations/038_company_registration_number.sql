-- Add company registration number to company settings
-- This appears on invoices, quotations, and emails alongside the VAT number.

ALTER TABLE public.company_settings
ADD COLUMN IF NOT EXISTS company_registration_number text;

COMMENT ON COLUMN public.company_settings.company_registration_number IS
  'Company registration number shown on invoice/quotation footers and emails.';
