-- =============================================================================
-- Migration 117: Supabase Security Advisor lockdown (stock / wallet / picker)
-- =============================================================================
--
-- Closes the database-linter warnings for SECURITY DEFINER functions that were
-- created AFTER the earlier PUBLIC-revoke cleanups (082/091/084) and therefore
-- still carry the default PUBLIC EXECUTE grant. By Postgres defaults that made
-- them callable by `anon` and `authenticated` over PostgREST
-- (/rest/v1/rpc/<name>).
--
-- What this migration does, in order:
--   A. Cap search_products.p_limit (public RPC hardening).
--   B. Add authorization gates + ownership + input validation to the stock
--      RPCs (adjust_invoice_item_stock, deduct_invoice_stock,
--      restore_invoice_stock, raise_low_stock_alerts). Stock only moves as a
--      side-effect of invoice lifecycle actions, so the gate uses the invoice
--      permission flags (admin always passes via has_staff_permission).
--   C. Add an authorization gate to log_client_account_action (audit forgery).
--   D. Lock trigger-only stock helpers to service_role.
--   E. Revoke default PUBLIC EXECUTE on every flagged function and re-grant
--      exactly the roles the application uses.
--   F. Drop the broad SELECT policy on the public `appearance` bucket (font
--      URLs keep working because the bucket itself is public = true).
--
-- Out of scope (done separately):
--   - Leaked Password Protection: Dashboard → Auth → Security (not SQL).
--   - search_products / check_rate_limit stay public BY DESIGN (rate limited).
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- A. Cap search_products.p_limit so the catalogue cannot be dumped in one call.
--    Body is identical to 065/115 lineage; only adds the limit clamp and keeps
--    the search_path set in 082 (public, extensions, pg_temp).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.search_products(
  p_query text,
  p_limit integer DEFAULT 20,
  p_active_only boolean DEFAULT true,
  p_exclude_temporary boolean DEFAULT true
)
RETURNS SETOF public.products
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_query text := trim(coalesce(p_query, ''));
  v_fts_query tsquery;
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100);
  v_temp_filter text := CASE WHEN p_exclude_temporary
    THEN ' AND NOT p.is_temporary'
    ELSE '' END;
BEGIN
  IF v_query = '' THEN
    RETURN QUERY EXECUTE
      'SELECT p.* FROM public.products p
       WHERE (NOT $1 OR p.is_active = true)' || v_temp_filter || '
       ORDER BY p.name
       LIMIT $2'
      USING p_active_only, v_limit;
    RETURN;
  END IF;

  v_fts_query := websearch_to_tsquery('english', v_query);

  CREATE TEMP TABLE IF NOT EXISTS _search_product_results (
    id uuid PRIMARY KEY,
    stage int NOT NULL,
    score numeric NOT NULL
  ) ON COMMIT DROP;

  TRUNCATE _search_product_results;

  EXECUTE '
    INSERT INTO _search_product_results (id, stage, score)
    SELECT p.id, 1, ts_rank_cd(p.search_document, $1, 32)
    FROM public.products p
    WHERE (NOT $2 OR p.is_active = true)' || v_temp_filter || '
      AND p.search_document @@ $1
    ON CONFLICT (id) DO NOTHING'
    USING v_fts_query, p_active_only;

  EXECUTE '
    INSERT INTO _search_product_results (id, stage, score)
    SELECT p.id, 2, greatest(
      similarity(p.name, $1),
      similarity(p.code, $1),
      similarity(p.category, $1),
      similarity(p.brand, $1),
      similarity(coalesce(public.array_to_text(p.search_tags), ''''), $1),
      similarity(p.description, $1)
    )
    FROM public.products p
    WHERE (NOT $2 OR p.is_active = true)' || v_temp_filter || '
      AND NOT EXISTS (SELECT 1 FROM _search_product_results r WHERE r.id = p.id)
      AND (
        similarity(p.name, $1) > 0.18
        OR similarity(p.code, $1) > 0.18
        OR similarity(p.category, $1) > 0.18
        OR similarity(p.brand, $1) > 0.18
        OR similarity(coalesce(public.array_to_text(p.search_tags), ''''), $1) > 0.18
        OR similarity(p.description, $1) > 0.18
      )
    ON CONFLICT (id) DO NOTHING'
    USING v_query, p_active_only;

  EXECUTE '
    INSERT INTO _search_product_results (id, stage, score)
    SELECT p.id, 3, 0.0
    FROM public.products p
    WHERE (NOT $2 OR p.is_active = true)' || v_temp_filter || '
      AND NOT EXISTS (SELECT 1 FROM _search_product_results r WHERE r.id = p.id)
      AND (
        p.name ILIKE ''%'' || $1 || ''%''
        OR p.code ILIKE ''%'' || $1 || ''%''
        OR coalesce(public.array_to_text(p.search_tags), '''') ILIKE ''%'' || $1 || ''%''
        OR p.description ILIKE ''%'' || $1 || ''%''
      )
    ON CONFLICT (id) DO NOTHING'
    USING v_query, p_active_only;

  RETURN QUERY
    SELECT p.*
    FROM public.products p
    JOIN _search_product_results r ON r.id = p.id
    ORDER BY r.stage, r.score DESC, p.name
    LIMIT v_limit;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- B. Stock RPCs: authorization gate + (for adjust) ownership + input validation.
--    has_staff_permission() returns true for admins, so admins always pass;
--    staff pass when they hold any invoice-lifecycle permission. service_role
--    is allowed for cron/admin paths. auth.uid() is preserved through trigger
--    calls, so trigger-driven stock moves keep working for permitted staff.
-- ─────────────────────────────────────────────────────────────────────────────

-- B1. deduct_invoice_stock -----------------------------------------------------
CREATE OR REPLACE FUNCTION public.deduct_invoice_stock(p_invoice_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enable_stock boolean;
  v_type text;
  v_status text;
BEGIN
  -- Authorization gate: any invoice/payment lifecycle permission is allowed,
  -- because stock moves as a system consequence of invoice/payment changes
  -- (including the recompute_invoice_paid -> status -> stock trigger chain).
  IF auth.role() <> 'service_role' THEN
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
    END IF;
    IF NOT (
      public.has_staff_permission('invoices_add')
      OR public.has_staff_permission('invoices_edit')
      OR public.has_staff_permission('invoices_change_status')
      OR public.has_staff_permission('invoices_delete')
      OR public.has_staff_permission('invoices_record_payment')
      OR public.has_staff_permission('invoices_delete_payment')
    ) THEN
      RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT enable_stock_routing INTO v_enable_stock
    FROM public.company_settings
   WHERE id = 1;

  IF v_enable_stock IS NOT TRUE THEN
    RETURN;
  END IF;

  SELECT type, status INTO v_type, v_status FROM public.invoices WHERE id = p_invoice_id;
  IF v_type IS DISTINCT FROM 'invoice' THEN
    RETURN;
  END IF;
  -- Only deduct for genuinely sent invoices (no-op for drafts/quotations so a
  -- direct RPC call cannot quietly drain stock for a non-issued document).
  IF v_status IS DISTINCT FROM 'sent' THEN
    RETURN;
  END IF;

  UPDATE public.products p
     SET stock_quantity = p.stock_quantity - ii.quantity
    FROM public.invoice_items ii
   WHERE ii.invoice_id = p_invoice_id
     AND ii.product_id = p.id
     AND p.track_stock = true
     AND ii.stock_deducted = 0;

  UPDATE public.invoice_items ii
     SET stock_deducted = ii.quantity
   WHERE ii.invoice_id = p_invoice_id
     AND ii.product_id IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM public.products p
       WHERE p.id = ii.product_id AND p.track_stock = true
     )
     AND ii.stock_deducted = 0;
END;
$$;

-- B2. restore_invoice_stock ----------------------------------------------------
CREATE OR REPLACE FUNCTION public.restore_invoice_stock(p_invoice_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enable_stock boolean;
BEGIN
  -- Authorization gate.
  IF auth.role() <> 'service_role' THEN
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
    END IF;
    IF NOT (
      public.has_staff_permission('invoices_add')
      OR public.has_staff_permission('invoices_edit')
      OR public.has_staff_permission('invoices_change_status')
      OR public.has_staff_permission('invoices_delete')
      OR public.has_staff_permission('invoices_record_payment')
      OR public.has_staff_permission('invoices_delete_payment')
    ) THEN
      RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT enable_stock_routing INTO v_enable_stock
    FROM public.company_settings
   WHERE id = 1;

  IF v_enable_stock IS NOT TRUE THEN
    RETURN;
  END IF;

  -- Restore stock for tracked product lines that were deducted.
  UPDATE public.products p
     SET stock_quantity = p.stock_quantity + ii.stock_deducted
    FROM public.invoice_items ii
   WHERE ii.invoice_id = p_invoice_id
     AND ii.product_id = p.id
     AND p.track_stock = true
     AND ii.stock_deducted > 0;

  -- Clear the deducted tracking.
  UPDATE public.invoice_items ii
     SET stock_deducted = 0
   WHERE ii.invoice_id = p_invoice_id
     AND ii.stock_deducted > 0;
END;
$$;

-- B3. raise_low_stock_alerts ---------------------------------------------------
CREATE OR REPLACE FUNCTION public.raise_low_stock_alerts(p_invoice_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enable_stock boolean;
BEGIN
  -- Authorization gate.
  IF auth.role() <> 'service_role' THEN
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
    END IF;
    IF NOT (
      public.has_staff_permission('invoices_add')
      OR public.has_staff_permission('invoices_edit')
      OR public.has_staff_permission('invoices_change_status')
      OR public.has_staff_permission('invoices_delete')
      OR public.has_staff_permission('invoices_record_payment')
      OR public.has_staff_permission('invoices_delete_payment')
    ) THEN
      RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT enable_stock_routing INTO v_enable_stock
    FROM public.company_settings
   WHERE id = 1;

  IF v_enable_stock IS NOT TRUE THEN
    RETURN;
  END IF;

  INSERT INTO public.stock_audit_alerts
    (product_id, invoice_item_id, invoice_id, alert_type, source, quantity_needed, raised_by, notes, status)
  SELECT
    p.id,
    ii.id,
    p_invoice_id,
    'low_stock',
    'system',
    ii.quantity,
    (SELECT created_by FROM public.invoices WHERE id = p_invoice_id),
    'Stock fell to ' || p.stock_quantity || ' (reorder level ' || p.reorder_level || ')',
    'open'
  FROM public.invoice_items ii
  JOIN public.products p ON p.id = ii.product_id
  WHERE ii.invoice_id = p_invoice_id
    AND p.track_stock = true
    AND p.reorder_level > 0
    AND p.stock_quantity <= p.reorder_level
    AND ii.stock_deducted > 0
    AND NOT EXISTS (
      SELECT 1 FROM public.stock_audit_alerts sa
      WHERE sa.invoice_id = p_invoice_id
        AND sa.invoice_item_id = ii.id
        AND sa.alert_type = 'low_stock'
        AND sa.source = 'system'
        AND sa.status = 'open'
    );
END;
$$;

-- B4. adjust_invoice_item_stock ------------------------------------------------
-- Most sensitive: caller supplies product ids / quantities via JSON. We now
-- (1) require an invoice-lifecycle permission, (2) lock the invoice and enforce
-- ownership/admin, (3) validate every referenced product belongs to this
-- invoice and quantities are sane, before touching products.stock_quantity.
CREATE OR REPLACE FUNCTION public.adjust_invoice_item_stock(
  p_invoice_id uuid,
  p_old_items jsonb,
  p_new_items jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enable_stock boolean;
  v_item jsonb;
  v_existing public.invoices;
BEGIN
  -- (1) Authorization gate.
  IF auth.role() <> 'service_role' THEN
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
    END IF;
    IF NOT (
      public.has_staff_permission('invoices_add')
      OR public.has_staff_permission('invoices_edit')
      OR public.has_staff_permission('invoices_change_status')
      OR public.has_staff_permission('invoices_delete')
      OR public.has_staff_permission('invoices_record_payment')
      OR public.has_staff_permission('invoices_delete_payment')
    ) THEN
      RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- (2) Lock the invoice and enforce ownership (creator or admin).
  SELECT * INTO v_existing FROM public.invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice not found' USING ERRCODE = 'P0002';
  END IF;
  IF auth.role() <> 'service_role'
     AND v_existing.created_by <> auth.uid()
     AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  -- (3) Validate inputs. New items must reference a product that is actually on
  -- this invoice, with a sane quantity. Old-item deductions are bounded.
  FOR v_item IN SELECT jsonb_array_elements(COALESCE(p_new_items, '[]'::jsonb))
  LOOP
    IF NULLIF(v_item->>'product_id', '') IS NULL THEN
      CONTINUE;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.invoice_items ii
      WHERE ii.invoice_id = p_invoice_id
        AND ii.product_id = (v_item->>'product_id')::uuid
    ) THEN
      RAISE EXCEPTION 'Product % is not a line on invoice %',
        v_item->>'product_id', p_invoice_id USING ERRCODE = '22023';
    END IF;
    IF COALESCE((v_item->>'quantity')::numeric, 0) < 0
       OR COALESCE((v_item->>'quantity')::numeric, 0) > 1000000 THEN
      RAISE EXCEPTION 'Invalid quantity for product %',
        v_item->>'product_id' USING ERRCODE = '22023';
    END IF;
  END LOOP;

  FOR v_item IN SELECT jsonb_array_elements(COALESCE(p_old_items, '[]'::jsonb))
  LOOP
    IF COALESCE((v_item->>'stock_deducted')::numeric, 0) < 0
       OR COALESCE((v_item->>'stock_deducted')::numeric, 0) > 1000000 THEN
      RAISE EXCEPTION 'Invalid stock_deducted value' USING ERRCODE = '22023';
    END IF;
  END LOOP;

  SELECT enable_stock_routing INTO v_enable_stock
    FROM public.company_settings
   WHERE id = 1;

  IF v_enable_stock IS NOT TRUE THEN
    RETURN;
  END IF;

  -- Restore old quantities for tracked products.
  FOR v_item IN SELECT jsonb_array_elements(COALESCE(p_old_items, '[]'::jsonb))
  LOOP
    UPDATE public.products p
       SET stock_quantity = p.stock_quantity + (v_item->>'stock_deducted')::numeric
     WHERE p.id = (v_item->>'product_id')::uuid
       AND p.track_stock = true
       AND (v_item->>'stock_deducted')::numeric > 0;
  END LOOP;

  -- Deduct new quantities for tracked products.
  FOR v_item IN SELECT jsonb_array_elements(COALESCE(p_new_items, '[]'::jsonb))
  LOOP
    UPDATE public.products p
       SET stock_quantity = p.stock_quantity - (v_item->>'quantity')::numeric
     WHERE p.id = (v_item->>'product_id')::uuid
       AND p.track_stock = true;
  END LOOP;

  -- Record what was deducted so restoration on later delete/status change is exact.
  UPDATE public.invoice_items ii
     SET stock_deducted = ii.quantity
   WHERE ii.invoice_id = p_invoice_id
     AND ii.product_id IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM public.products p
       WHERE p.id = ii.product_id AND p.track_stock = true
     );
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- C. log_client_account_action: prevent audit-log forgery. Require admin or the
--    clients_manage_account permission (the same capability that gates deposit
--    / apply-balance). performed_by is still taken from auth.uid(), never the
--    caller.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.log_client_account_action(
  p_action text,
  p_client_id uuid DEFAULT NULL,
  p_invoice_ids uuid[] DEFAULT NULL,
  p_amount numeric DEFAULT NULL,
  p_verified_name text DEFAULT NULL,
  p_ip_address text DEFAULT NULL,
  p_user_agent text DEFAULT NULL,
  p_metadata jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() <> 'service_role' THEN
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
    END IF;
    IF NOT (public.is_admin() OR public.has_staff_permission('clients_manage_account')) THEN
      RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
    END IF;
  END IF;

  INSERT INTO public.client_account_audit_log (
    action, client_id, invoice_ids, amount, verified_name, performed_by,
    ip_address, user_agent, metadata
  ) VALUES (
    p_action, p_client_id, p_invoice_ids, p_amount, p_verified_name, auth.uid(),
    p_ip_address, p_user_agent, p_metadata
  );
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- D. Trigger-only stock helpers: no role should call them directly. Triggers
--    run as the function owner (DEFINER) and do not need an EXECUTE grant.
-- ─────────────────────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.handle_invoice_stock_on_insert() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_invoice_stock_on_delete() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_invoice_stock_on_status_change() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_invoice_stock_on_insert() TO service_role;
GRANT EXECUTE ON FUNCTION public.handle_invoice_stock_on_delete() TO service_role;
GRANT EXECUTE ON FUNCTION public.handle_invoice_stock_on_status_change() TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- E. Revoke default PUBLIC EXECUTE on every flagged function, then re-grant
--    exactly the roles the application actually uses.
-- ─────────────────────────────────────────────────────────────────────────────

-- E1. Public-by-design RPCs (rate limited; safe read surfaces).
REVOKE EXECUTE ON FUNCTION public.check_rate_limit(text, integer, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.search_products(text, integer, boolean, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, integer, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_products(text, integer, boolean, boolean) TO anon, authenticated;

-- E2. Stock RPCs (app calls via authenticated SSR; service_role for triggers/cron).
REVOKE EXECUTE ON FUNCTION public.adjust_invoice_item_stock(uuid, jsonb, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.deduct_invoice_stock(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.restore_invoice_stock(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.raise_low_stock_alerts(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.adjust_invoice_item_stock(uuid, jsonb, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.deduct_invoice_stock(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.restore_invoice_stock(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.raise_low_stock_alerts(uuid) TO authenticated, service_role;

-- E3. Wallet RPCs (self-authorizing internally).
REVOKE EXECUTE ON FUNCTION public.deposit_to_client_account(uuid, numeric, text, text, text, text, date) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.apply_client_account_balance(uuid, uuid[], numeric[], text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.log_client_account_action(text, uuid, uuid[], numeric, text, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.deposit_to_client_account(uuid, numeric, text, text, text, text, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.apply_client_account_balance(uuid, uuid[], numeric[], text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.log_client_account_action(text, uuid, uuid[], numeric, text, text, text, jsonb) TO authenticated, service_role;

-- E4. Picker RPC (service_role only — app calls via admin client).
REVOKE EXECUTE ON FUNCTION public.save_pick_state(uuid, uuid, jsonb, text, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_pick_state(uuid, uuid, jsonb, text, timestamptz) TO service_role;

-- E5. Deletion-protection RPCs (self-authorizing: auth.uid + deletion password).
REVOKE EXECUTE ON FUNCTION public.soft_delete_client(uuid, text, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.soft_delete_product(uuid, text, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.soft_delete_invoice(uuid, text, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.soft_delete_payment(uuid, text, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.restore_client(uuid, text, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.restore_product(uuid, text, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.restore_invoice(uuid, text, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.hard_delete_draft_invoice(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_deletion_password(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.change_deletion_password(text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.verify_deletion_password(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.soft_delete_client(uuid, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.soft_delete_product(uuid, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.soft_delete_invoice(uuid, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.soft_delete_payment(uuid, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.restore_client(uuid, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.restore_product(uuid, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.restore_invoice(uuid, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.hard_delete_draft_invoice(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_deletion_password(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.change_deletion_password(text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.verify_deletion_password(text) TO authenticated, service_role;

-- E6. Internal-only deletion helpers (called by other DEFINER functions / server).
REVOKE EXECUTE ON FUNCTION public.get_deletion_password_hash() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_deletion_event(text, text, uuid, text, text, boolean, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.user_can_delete_client(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.user_can_delete_product(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.user_can_delete_invoice(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.user_can_delete_payment(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_deletion_password_hash() TO service_role;
GRANT EXECUTE ON FUNCTION public.log_deletion_event(text, text, uuid, text, text, boolean, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.user_can_delete_client(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.user_can_delete_product(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.user_can_delete_invoice(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.user_can_delete_payment(uuid, uuid) TO service_role;

-- E7. Cron / trigger-only helpers.
REVOKE EXECUTE ON FUNCTION public.cleanup_stale_draft_invoices() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_stale_draft_invoices() TO service_role;
REVOKE EXECUTE ON FUNCTION public.enforce_profile_update_scope() FROM PUBLIC, anon, authenticated, service_role;

-- E8. Authenticated dashboard RPCs + RLS helpers.
REVOKE EXECUTE ON FUNCTION public.generate_document_number(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.generate_unique_order_number() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_staff_permission(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_client_of_invoice(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_own_client(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.replace_company_contact_channels(integer, jsonb, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.update_invoice_with_items(uuid, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_document_number(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.generate_unique_order_number() TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_staff_permission(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_client_of_invoice(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_own_client(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.replace_company_contact_channels(integer, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_invoice_with_items(uuid, uuid, jsonb) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- F. Drop the broad SELECT policy on the public `appearance` bucket.
--    Font URLs keep working because the bucket itself is public = true; this
--    only removes SQL/API metadata listing (matches 082 for logos/team-assets).
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Public read access on appearance fonts" ON storage.objects;

-- ─────────────────────────────────────────────────────────────────────────────
-- G. Documentation markers.
-- ─────────────────────────────────────────────────────────────────────────────
COMMENT ON FUNCTION public.adjust_invoice_item_stock(uuid, jsonb, jsonb)
  IS 'Stock reconciliation for sent-invoice edits. Gated: invoice permission + owner/admin. service_role allowed. Locked down in migration 117.';
COMMENT ON FUNCTION public.deduct_invoice_stock(uuid)
  IS 'Deduct stock when an invoice is sent. Gated: invoice permission. service_role allowed. Locked down in migration 117.';
COMMENT ON FUNCTION public.restore_invoice_stock(uuid)
  IS 'Restore stock when an invoice is reversed/deleted. Gated: invoice permission. service_role allowed. Locked down in migration 117.';
COMMENT ON FUNCTION public.raise_low_stock_alerts(uuid)
  IS 'Raise low-stock alerts for an invoice. Gated: invoice permission. service_role allowed. Locked down in migration 117.';
COMMENT ON FUNCTION public.log_client_account_action(text, uuid, uuid[], numeric, text, text, text, jsonb)
  IS 'Append client-account audit row. Gated: admin or clients_manage_account. Locked down in migration 117.';
