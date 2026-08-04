-- =============================================================================
-- 154_admin_mark_delivered_rpc.sql
-- =============================================================================
-- Fix the "You are not authorised to perform that action." (42501) error
-- when an admin/staff user marks an invoice as Delivered from the Invoices
-- list (DeliveryStatusSelect -> updateDeliveryStatus -> markInvoiceDelivered).
--
-- Root cause: same as migration 134. The action did several direct writes
-- via the service-role client (complete printed loads, delete open drafts,
-- UPDATE invoices.picking_status, reconcile stock). Migration 131 granted
-- service_role writes on the load tables, but nothing ever granted
-- service_role UPDATE on public.invoices, so the invoice UPDATE failed with
-- 42501 once the load operations had already succeeded. The admin saw
-- "You are not authorised to perform that action." (mapped from 42501 in
-- lib/errors.ts) and the invoice was left in a half-state: loads completed
-- / drafts cleared, but picking_status still 'loaded' or 'partially_loaded'.
--
-- Same fix pattern as 133/134/140/147: move the whole operation into a
-- SECURITY DEFINER RPC so it runs as the function owner (postgres), which
-- does not depend on table-level GRANTs. All-or-nothing — if the stock
-- reconcile fails, the whole completion rolls back instead of leaving a
-- half-completed order.
--
-- Self-healing on retry: if a prior failed attempt already completed the
-- printed loads and deleted the open drafts, this RPC sees no 'printed' or
-- 'open' loads to act on, and just stamps picking_status='delivered' on
-- the invoice (and reconciles stock if any loads remain). No data is left
-- in an inconsistent state.
--
-- Idempotent: safe to re-run.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Re-assert service-role write grants (from 131, idempotent)
--    Even though this RPC bypasses the need for the grants, re-asserting
--    them keeps the helper functions in 131/133 happy and matches the
--    pattern in 133/134.
-- ─────────────────────────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.delivery_loads TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.delivery_load_items TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_audit_alerts TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.delivery_alerts TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. mark_invoice_delivered_admin — admin/staff override
--    Atomically complete printed loads, abandon open drafts, stamp the
--    invoice delivered, and settle stock from the loads.
--
--    Callers MUST have already verified the caller's role in app code
--    (admin or invoices_change_status permission). The RPC does not
--    re-check the caller — it runs as the function owner. This matches
--    mark_order_completed (134) and driver_mark_delivered (140/147).
--
--    Errors raised:
--      P0002 'Invoice not found or not available.'  — wrong id / soft-deleted
--      P0001 'Order is already marked as delivered.' — idempotent skip
--    Any other failure (e.g. reconcile_invoice_stock_from_loads raises)
--    rolls back the whole transaction so no half-state is left behind.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mark_invoice_delivered_admin(p_invoice_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice public.invoices%ROWTYPE;
  v_load_count integer;
  v_now timestamptz := now();
BEGIN
  -- Lock and validate the invoice. FOR UPDATE serialises concurrent
  -- admin override attempts (and the driver_mark_delivered path) on the
  -- same invoice, mirroring the 140/147 pattern.
  SELECT * INTO v_invoice
    FROM public.invoices
   WHERE id = p_invoice_id
     AND type = 'invoice'
     AND deleted_at IS NULL
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice not found or not available.' USING ERRCODE = 'P0002';
  END IF;
  IF v_invoice.picking_status = 'delivered' THEN
    -- Idempotent: a prior successful run already did this. Don't fail the
    -- second call so the operator's "click again to be sure" habit doesn't
    -- surface as an error.
    RETURN;
  END IF;

  -- 1. Complete printed loads. Self-heals a prior failed attempt whose
  --    load step succeeded but invoice UPDATE failed — there are no
  --    'printed' loads left, this becomes a no-op.
  UPDATE public.delivery_loads
     SET status = 'completed', completed_at = v_now
   WHERE invoice_id = p_invoice_id
     AND status = 'printed';

  -- 2. Abandon any open draft loads. Uncommitted picking work that the
  --    override supersedes — leaving them would strand pickers (saves are
  --    rejected for delivered invoices) and hide any later-printed load
  --    from the driver queue (which filters out delivered invoices).
  --    Same self-heal: prior attempt may already have done this.
  DELETE FROM public.delivery_loads
   WHERE invoice_id = p_invoice_id
     AND status = 'open';

  -- 3. Stamp the invoice delivered. This is the line that previously
  --    failed with 42501 — inside SECURITY DEFINER it runs as the function
  --    owner, so no service_role GRANT on public.invoices is needed.
  --    The trigger invoices_sync_delivery_alerts fires here and resolves
  --    any overdue delivery_alerts row for this invoice.
  UPDATE public.invoices
     SET picking_status = 'delivered',
         picking_delivered_at = v_now
   WHERE id = p_invoice_id
     AND picking_status IS DISTINCT FROM 'delivered';

  -- 4. Settle tracked stock to what actually left the yard. Only when
  --    the invoice has loads — with no loads there is nothing to settle
  --    and reconcile_invoice_stock_from_loads would misread "nothing
  --    loaded" as "nothing went out" and restore stock that was correctly
  --    deducted when the invoice was issued. (Same guard as the picker
  --    "order completed" path in 134.)
  SELECT COUNT(*) INTO v_load_count
    FROM public.delivery_loads
   WHERE invoice_id = p_invoice_id;

  IF v_load_count > 0 THEN
    PERFORM public.reconcile_invoice_stock_from_loads(p_invoice_id);
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.mark_invoice_delivered_admin(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_invoice_delivered_admin(uuid) TO service_role;

COMMENT ON FUNCTION public.mark_invoice_delivered_admin(uuid) IS
  'Admin/staff override: atomically mark an invoice as delivered (complete printed loads, abandon open drafts, stamp picking_status=delivered, reconcile stock). SECURITY DEFINER so it does not depend on table grants on public.invoices.';
