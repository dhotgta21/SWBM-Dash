-- Migration 113: enforce a single open picker/system alert per invoice item.
--
-- The picker upsert in lib/actions/picker.ts uses
--   onConflict: 'invoice_item_id,alert_type,source'
-- That needs a matching unique constraint/index. We scope it to open alerts
-- so resolved/ordered alerts can be re-raised later.

CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_audit_alerts_open_unique
  ON public.stock_audit_alerts (invoice_item_id, alert_type, source)
  WHERE status = 'open';
