-- Migration 112: close stock-routing trigger gaps.
--
-- 1. New invoices created with status 'sent' never fired the AFTER UPDATE status
--    trigger, so stock was not deducted. Add an AFTER INSERT trigger.
-- 2. The status-change trigger restored stock on any move away from 'sent',
--    including sent → paid/partial/converted. Stock should only be restored
--    when an invoice returns to 'draft'.

CREATE OR REPLACE FUNCTION public.handle_invoice_stock_on_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Deduct when moving to 'sent'.
  IF OLD.status <> 'sent' AND NEW.status = 'sent' THEN
    PERFORM public.deduct_invoice_stock(NEW.id);
    PERFORM public.raise_low_stock_alerts(NEW.id);
  END IF;

  -- Restore only when moving back to 'draft'.
  IF OLD.status = 'sent' AND NEW.status = 'draft' THEN
    PERFORM public.restore_invoice_stock(NEW.id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS invoices_stock_status_trigger ON public.invoices;
CREATE TRIGGER invoices_stock_status_trigger
  AFTER UPDATE OF status ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.handle_invoice_stock_on_status_change();

CREATE OR REPLACE FUNCTION public.handle_invoice_stock_on_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'sent' THEN
    PERFORM public.deduct_invoice_stock(NEW.id);
    PERFORM public.raise_low_stock_alerts(NEW.id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS invoices_stock_insert_trigger ON public.invoices;
CREATE TRIGGER invoices_stock_insert_trigger
  AFTER INSERT ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.handle_invoice_stock_on_insert();
