-- =============================================================================
-- 104_invoice_stamp_modes.sql
--
-- Wraps the per-stamp toggles (added in 103) with a master on/off switch
-- and an Auto / Manual mode selector.
--
--   status_stamps_enabled boolean
--     Master switch. When FALSE, no status stamp renders on this invoice
--     regardless of the individual PAID / PARTIALLY PAID / OVERDUE toggles
--     or the mode setting. Default TRUE so newly-issued invoices still
--     stamp automatically.
--
--   status_stamps_mode text ('auto' | 'manual')
--     Controls how the three per-stamp toggles are interpreted:
--
--       'auto'  (default)
--         The system auto-detects which stamp to show based on the invoice
--         status. PAID and PARTIALLY PAID default to ON. OVERDUE auto-
--         activates 30 days past the due date (the cool-down) — see the
--         30-day rule in the renderer. The three individual toggles act
--         as per-stamp opt-outs (operators can disable any single stamp
--         while leaving the rest on).
--
--       'manual'
--         The system shows a stamp ONLY when the operator has flipped its
--         individual toggle to TRUE. No auto behaviour, no cool-down.
--         All three toggles default FALSE in manual mode.
--
-- The renderer (InvoicePdfTemplate + InvoiceDocument) consults all three
-- columns: master switch first, then mode, then per-stamp toggle + status
-- (or the 30-day cool-down for OVERDUE in auto mode).
-- =============================================================================

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS status_stamps_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS status_stamps_mode    text     NOT NULL DEFAULT 'auto';

-- Mode must be one of the two values; anything else would make the render
-- logic's branching nonsensical. Safe to re-run: drop-then-add.
ALTER TABLE public.invoices
  DROP CONSTRAINT IF EXISTS invoices_status_stamps_mode_check;
ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_status_stamps_mode_check
  CHECK (status_stamps_mode IN ('auto', 'manual'));

COMMENT ON COLUMN public.invoices.status_stamps_enabled IS
  'Master switch for the status-stamp feature. When FALSE, no status stamp renders on this invoice regardless of the per-stamp toggles or the auto/manual mode.';
COMMENT ON COLUMN public.invoices.status_stamps_mode IS
  '`auto` (default) auto-detects the right stamp from status + 30-day cool-down for OVERDUE; `manual` requires the operator to flip each per-stamp toggle on individually.';