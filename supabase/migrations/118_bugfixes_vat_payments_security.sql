-- 118_bugfixes_vat_payments_security.sql
-- Fixes from the full project scan:
--   1. Soft-deleted payments must not re-enter amount_paid
--   2. Company default VAT rate (adjustable in Settings)
--   3. Bank details not readable by clients/pickers
--   4. hard_delete allows short-window cleanup of item-less orphans
--   5. Public-share status allow-list helpers (app enforces; doc here)

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. recompute_invoice_paid — exclude soft-deleted payments
-- ─────────────────────────────────────────────────────────────────────────────
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
  v_new_status text;
  v_picking_status text;
BEGIN
  IF v_invoice_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(SUM(amount), 0)
    INTO v_paid
    FROM public.payments
   WHERE invoice_id = v_invoice_id
     AND deleted_at IS NULL;

  SELECT total, status, picking_status
    INTO v_total, v_current_status, v_picking_status
    FROM public.invoices
   WHERE id = v_invoice_id;

  v_new_status := CASE
    WHEN v_total IS NULL THEN v_current_status
    WHEN v_total > 0 AND v_paid >= v_total THEN 'paid'
    WHEN v_paid > 0 THEN 'partial'
    WHEN v_current_status = 'draft' THEN 'draft'
    ELSE 'sent'
  END;

  UPDATE public.invoices
     SET amount_paid = v_paid,
         status = v_new_status,
         picking_status = CASE
           WHEN v_new_status = 'paid'
                AND v_picking_status IN ('loaded', 'completed')
                AND picking_status <> 'delivered'
             THEN 'delivered'
           ELSE picking_status
         END,
         picking_delivered_at = CASE
           WHEN v_new_status = 'paid'
                AND v_picking_status IN ('loaded', 'completed')
                AND picking_status <> 'delivered'
             THEN now()
           ELSE picking_delivered_at
         END,
         updated_at = now()
   WHERE id = v_invoice_id;

  RETURN NULL;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Company default VAT rate (percent, e.g. 20 = 20%)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS default_vat_rate numeric(5,2) NOT NULL DEFAULT 20;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'company_settings_default_vat_rate_check'
  ) THEN
    ALTER TABLE public.company_settings
      ADD CONSTRAINT company_settings_default_vat_rate_check
      CHECK (default_vat_rate >= 0 AND default_vat_rate <= 100);
  END IF;
END $$;

COMMENT ON COLUMN public.company_settings.default_vat_rate IS
  'Default VAT percentage applied to new invoices/quotes when VAT is on (0–100).';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Bank details: operators only (admin + staff). Public PDF uses service role.
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS company_bank_select ON public.company_bank_details;
CREATE POLICY company_bank_select ON public.company_bank_details
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'staff')
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Expand hard_delete: keep draft-window cleanup, and also allow cleanup of
--    item-less orphans (any status) created in the last hour by the same user.
--    App create path now inserts as draft first; this is belt-and-braces.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.hard_delete_draft_invoice(p_invoice_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_deleted boolean := false;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN false;
  END IF;

  -- Path A: classic — draft created by caller within 1 hour.
  DELETE FROM public.invoices
   WHERE id = p_invoice_id
     AND status = 'draft'
     AND created_by = v_user_id
     AND created_at > now() - interval '1 hour';

  IF FOUND THEN
    RETURN true;
  END IF;

  -- Path B: orphan header with zero live line items, unpaid, < 1 hour old.
  DELETE FROM public.invoices i
   WHERE i.id = p_invoice_id
     AND i.created_by = v_user_id
     AND i.created_at > now() - interval '1 hour'
     AND COALESCE(i.amount_paid, 0) = 0
     AND NOT EXISTS (
       SELECT 1 FROM public.invoice_items ii
        WHERE ii.invoice_id = i.id
          AND ii.deleted_at IS NULL
     );

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.hard_delete_draft_invoice(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hard_delete_draft_invoice(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hard_delete_draft_invoice(uuid) TO service_role;
