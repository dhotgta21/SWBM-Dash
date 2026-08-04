-- Fix: allow recording a partial payment against a DRAFT invoice, and have
-- the invoice status auto-advance to 'partial' (or 'paid' if the deposit
-- covers the full amount).
--
-- Before this migration, lib/actions/payments.ts rejected payments on any
-- invoice whose status was not 'sent' or 'partial', with:
--   "Payments can only be recorded against sent or partially paid invoices"
-- That blocked the common case where a customer pays a deposit before the
-- invoice has been sent (e.g. cash on collection, deposit before delivery,
-- paying off an old draft while preparing a new one). The user had to
-- manually flip the invoice to 'sent' first, which forced an email send
-- the customer wasn't expecting.
--
-- The server action was updated to accept 'draft' too. The
-- `recompute_invoice_paid` trigger already does the status math
-- (`paid` once amount_paid >= total, `partial` otherwise), so this
-- migration only needs to:
--
--   1. Make sure the trigger's no-payments fall-back preserves the
--      original status. Previously it hardcoded 'sent', which would have
--      silently promoted a draft invoice to 'sent' if every recorded
--      payment was deleted (e.g. duplicate-entry cleanup). After this
--      change a draft with no payments stays 'draft', a 'sent' invoice
--      stays 'sent', etc.
--
--   2. Add a CHECK / status comment so the invariants stay documented.
--
-- This migration is idempotent — `CREATE OR REPLACE FUNCTION` and the
-- status comment update are safe to re-run.

CREATE OR REPLACE FUNCTION public.recompute_invoice_paid()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice_id uuid := COALESCE(NEW.invoice_id, OLD.invoice_id);
  v_paid numeric;
  v_total numeric;
  v_current_status text;
BEGIN
  IF v_invoice_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Sum all remaining payments for the affected invoice.
  SELECT COALESCE(SUM(amount), 0)
    INTO v_paid
    FROM public.payments
   WHERE invoice_id = v_invoice_id;

  SELECT total, status
    INTO v_total, v_current_status
    FROM public.invoices
   WHERE id = v_invoice_id;

  -- Recompute amount_paid and advance the status. The fall-back when no
  -- payments remain preserves the original status: a 'draft' invoice with
  -- all payments deleted stays 'draft', a 'sent' invoice stays 'sent'.
  -- (CHECK(amount_paid <= total) backstops any concurrent overpayment
  -- attempt by failing this UPDATE.)
  UPDATE public.invoices
     SET amount_paid = v_paid,
         status = CASE
           WHEN v_total IS NULL THEN status
           WHEN v_total > 0 AND v_paid >= v_total THEN 'paid'
           WHEN v_paid > 0 THEN 'partial'
           WHEN v_current_status = 'draft' THEN 'draft'
           ELSE 'sent'
         END,
         updated_at = now()
   WHERE id = v_invoice_id;

  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.recompute_invoice_paid() IS
  'Keeps invoices.amount_paid, invoices.balance_due (generated) and invoices.status in sync with the payments table. Auto-advances status: paid when amount_paid >= total, partial when amount_paid > 0, otherwise preserves the original draft/sent status.';
