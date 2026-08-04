-- Security hardening: RPC internals and team-management trigger.
--
-- 1. Tighten enforce_profile_update_scope so only administrators can change
--    role. The application-layer team management actions already require admin,
--    but the database trigger previously allowed staff with
--    settings_manage_team to promote/demote themselves or others via direct
--    Supabase client calls. Aligning the DB layer with the app layer removes
--    that privilege-escalation path.
--
-- 2. Fix update_invoice_with_items so order_number and account_number are
--    preserved when the caller omits them from the payload. The previous
--    NULLIF(..., '') logic overwrote the existing column with NULL whenever the
--    key was absent, causing silent data loss on every invoice edit.

-- ---------------------------------------------------------------------------
-- 1. Role changes require admin.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_profile_update_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- The service-role key is used by server actions for sensitive operations
  -- (e.g. flipping a new invitee to role='client'). Skip all checks for it.
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Only administrators may change client linkage or active status.
  IF NEW.client_id IS DISTINCT FROM OLD.client_id
     OR NEW.is_active IS DISTINCT FROM OLD.is_active THEN
    IF NOT public.is_admin() THEN
      RAISE EXCEPTION 'Only administrators can change client link or active status.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Role changes are now admin-only. The previous rule allowed team managers
  -- (settings_manage_team) to transition roles between admin and staff, which
  -- let a staff user promote themselves to admin by bypassing the application
  -- layer and calling the Supabase client directly.
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    IF NOT public.is_admin() THEN
      RAISE EXCEPTION 'Only administrators can change role.'
        USING ERRCODE = '42501';
    END IF;
    IF NEW.role NOT IN ('admin', 'staff', 'client') OR OLD.role NOT IN ('admin', 'staff', 'client') THEN
      RAISE EXCEPTION 'Invalid role transition.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Email, permissions and account_number are sensitive. Only admins may change
  -- them on someone else's row; owners may still change their own email.
  IF NEW.email IS DISTINCT FROM OLD.email
     OR NEW.permissions IS DISTINCT FROM OLD.permissions
     OR NEW.account_number IS DISTINCT FROM OLD.account_number THEN
    IF NOT public.is_admin() AND OLD.id <> auth.uid() THEN
      RAISE EXCEPTION 'Only administrators can change email, permissions, or account number on another user.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

GRANT EXECUTE ON FUNCTION public.enforce_profile_update_scope() TO authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_profile_update_scope() TO service_role;

-- ---------------------------------------------------------------------------
-- 2. Preserve order_number and account_number when omitted from payload.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_invoice_with_items(
  p_invoice_id uuid,
  p_user_id uuid,
  p_payload jsonb
) RETURNS public.invoices
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing public.invoices;
  v_is_admin boolean;
  v_item jsonb;
  v_sort integer := 0;
BEGIN
  -- Lock the row to prevent concurrent edits.
  SELECT * INTO v_existing FROM public.invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice not found' USING ERRCODE = 'P0002';
  END IF;

  -- Authorization: caller must be the owner or an admin. SECURITY
  -- DEFINER preserves auth.uid() so is_admin() resolves against the
  -- session user, not the function owner. We deliberately check
  -- auth.uid() instead of trusting p_user_id, so even a misbehaving
  -- caller passing someone else's id is still gated correctly.
  SELECT public.is_admin() INTO v_is_admin;
  IF v_existing.created_by <> auth.uid() AND NOT v_is_admin THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  -- Update invoice metadata. NULLIF keeps empty strings from clobbering
  -- existing values when the field was omitted. Keys that are absent from the
  -- payload preserve the existing column value; keys that are present (even as
  -- empty strings) update it. This matches the caller's documented contract.
  UPDATE public.invoices SET
    client_id              = COALESCE(NULLIF(p_payload->>'client_id', '')::uuid, client_id),
    issue_date             = COALESCE(NULLIF(p_payload->>'issue_date', '')::date, issue_date),
    issue_time             = CASE
                              WHEN p_payload ? 'issue_time' THEN NULLIF(p_payload->>'issue_time', '')::time
                              ELSE issue_time
                            END,
    due_date               = NULLIF(p_payload->>'due_date', '')::date,
    expiry_date            = NULLIF(p_payload->>'expiry_date', '')::date,
    order_number           = CASE
                              WHEN p_payload ? 'order_number'
                                THEN NULLIF(p_payload->>'order_number', '')
                              ELSE order_number
                            END,
    account_number         = CASE
                              WHEN p_payload ? 'account_number'
                                THEN NULLIF(p_payload->>'account_number', '')
                              ELSE account_number
                            END,
    operator_name          = COALESCE(NULLIF(p_payload->>'operator_name', ''), operator_name),
    your_reference         = NULLIF(p_payload->>'your_reference', ''),
    notes                  = NULLIF(p_payload->>'notes', ''),
    status                 = COALESCE(NULLIF(p_payload->>'status', ''), status),
    delivery_method        = COALESCE(NULLIF(p_payload->>'delivery_method', ''), delivery_method),
    delivery_address_line_1 = NULLIF(p_payload->>'delivery_address_line_1', ''),
    delivery_address_line_2 = NULLIF(p_payload->>'delivery_address_line_2', ''),
    delivery_town          = NULLIF(p_payload->>'delivery_town', ''),
    delivery_county        = NULLIF(p_payload->>'delivery_county', ''),
    delivery_postcode      = UPPER(NULLIF(p_payload->>'delivery_postcode', '')),
    subtotal               = (p_payload->>'subtotal')::numeric,
    vat_total              = (p_payload->>'vat_total')::numeric,
    total                  = (p_payload->>'total')::numeric,
    updated_at             = now()
  WHERE id = p_invoice_id;

  -- Replace line items atomically. DELETE + INSERT in the same transaction
  -- either both commit or both roll back, so items can never end up doubled
  -- or empty after a partial failure.
  DELETE FROM public.invoice_items WHERE invoice_id = p_invoice_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_payload->'items', '[]'::jsonb))
  LOOP
    INSERT INTO public.invoice_items (
      invoice_id, product_id, product_name, product_code, unit,
      quantity, price, vat_rate, vat_amount, line_total, sort_order
    ) VALUES (
      p_invoice_id,
      NULLIF(v_item->>'product_id', '')::uuid,
      v_item->>'product_name',
      NULLIF(v_item->>'product_code', ''),
      COALESCE(NULLIF(v_item->>'unit', ''), 'EA'),
      (v_item->>'quantity')::numeric,
      (v_item->>'price')::numeric,
      (v_item->>'vat_rate')::numeric,
      (v_item->>'vat_amount')::numeric,
      (v_item->>'line_total')::numeric,
      v_sort
    );
    v_sort := v_sort + 1;
  END LOOP;

  -- Return the updated row. The CHECK(amount_paid <= total) constraint on the
  -- table is enforced here: if the new total is below amount_paid, the
  -- implicit statement aborts and the whole transaction rolls back.
  RETURN (SELECT * FROM public.invoices WHERE id = p_invoice_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_invoice_with_items(uuid, uuid, jsonb) TO authenticated;
