-- =============================================================================
-- DEMO / partial schema: client wallet deposits + ledger
-- Fixes "Could not record the deposit" when deposit_to_client_account is missing.
-- Safe to re-run (IF NOT EXISTS / CREATE OR REPLACE).
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Helpers used by deposit RPC
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'admin'
      AND COALESCE(is_active, true)
  );
$$;

CREATE OR REPLACE FUNCTION public.has_staff_permission(p_permission text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_role text;
  v_perms jsonb;
BEGIN
  SELECT role, permissions INTO v_role, v_perms
    FROM public.profiles
   WHERE id = auth.uid();

  IF v_role IS NULL THEN
    RETURN false;
  END IF;
  IF v_role = 'admin' THEN
    RETURN true;
  END IF;
  IF v_role <> 'staff' THEN
    RETURN false;
  END IF;
  IF v_perms IS NULL OR jsonb_typeof(v_perms) <> 'object' THEN
    RETURN false;
  END IF;
  RETURN COALESCE((v_perms ->> p_permission)::boolean, false);
END;
$$;

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS account_balance numeric(12,2) NOT NULL DEFAULT 0;

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS source text;

-- Soft-add check for payments.source without failing if column already constrained
DO $$
BEGIN
  UPDATE public.payments SET source = 'direct' WHERE source IS NULL;
  BEGIN
    ALTER TABLE public.payments
      ALTER COLUMN source SET DEFAULT 'direct';
  EXCEPTION WHEN others THEN NULL;
  END;
  BEGIN
    ALTER TABLE public.payments
      ALTER COLUMN source SET NOT NULL;
  EXCEPTION WHEN others THEN NULL;
  END;
END $$;

CREATE TABLE IF NOT EXISTS public.client_account_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  type text NOT NULL CHECK (type IN ('deposit', 'allocation', 'withdrawal', 'adjustment')),
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  transaction_date date NOT NULL DEFAULT CURRENT_DATE,
  running_balance numeric(12,2) NOT NULL,
  invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  payment_id uuid REFERENCES public.payments(id) ON DELETE SET NULL,
  method text,
  reference text,
  notes text,
  verified_name text,
  verified_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  verified_at timestamptz,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_account_transactions_client_id_created_at
  ON public.client_account_transactions(client_id, created_at DESC);

ALTER TABLE public.client_account_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS client_account_transactions_select ON public.client_account_transactions;
CREATE POLICY client_account_transactions_select ON public.client_account_transactions
  FOR SELECT TO authenticated USING (
    public.is_admin()
    OR (
      public.has_staff_permission('clients_manage_account')
      AND public.has_staff_permission('clients_see_money')
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'client'
        AND p.client_id = client_account_transactions.client_id
    )
  );

DROP POLICY IF EXISTS client_account_transactions_insert ON public.client_account_transactions;
CREATE POLICY client_account_transactions_insert ON public.client_account_transactions
  FOR INSERT TO authenticated WITH CHECK (false);

DROP POLICY IF EXISTS client_account_transactions_update ON public.client_account_transactions;
CREATE POLICY client_account_transactions_update ON public.client_account_transactions
  FOR UPDATE TO authenticated USING (false);

DROP POLICY IF EXISTS client_account_transactions_delete ON public.client_account_transactions;
CREATE POLICY client_account_transactions_delete ON public.client_account_transactions
  FOR DELETE TO authenticated USING (false);

-- Audit log (optional table used by app)
CREATE TABLE IF NOT EXISTS public.client_account_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action text NOT NULL,
  client_id uuid,
  amount numeric(12,2),
  verified_name text,
  ip_address text,
  user_agent text,
  metadata jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.client_account_audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS client_account_audit_log_select ON public.client_account_audit_log;
CREATE POLICY client_account_audit_log_select ON public.client_account_audit_log
  FOR SELECT TO authenticated USING (public.is_admin());
DROP POLICY IF EXISTS client_account_audit_log_insert ON public.client_account_audit_log;
CREATE POLICY client_account_audit_log_insert ON public.client_account_audit_log
  FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid() OR public.is_admin());

CREATE OR REPLACE FUNCTION public.log_client_account_action(
  p_action text,
  p_client_id uuid DEFAULT NULL,
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
  INSERT INTO public.client_account_audit_log (
    action, client_id, amount, verified_name, ip_address, user_agent, metadata, created_by
  ) VALUES (
    p_action, p_client_id, p_amount, p_verified_name, p_ip_address, p_user_agent, p_metadata, auth.uid()
  );
EXCEPTION WHEN others THEN
  -- Never block the money action on audit failure
  NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.deposit_to_client_account(
  p_client_id uuid,
  p_amount numeric,
  p_method text,
  p_reference text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_verified_name text DEFAULT NULL,
  p_transaction_date date DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_transaction_id uuid;
  v_new_balance numeric;
  v_verified_name text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  IF NOT (
    public.is_admin()
    OR (public.has_staff_permission('clients_manage_account') AND public.has_staff_permission('clients_see_money'))
  ) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be greater than zero' USING ERRCODE = '22023';
  END IF;

  IF p_method IS NULL OR p_method NOT IN ('cash', 'bank_transfer', 'card', 'cheque', 'other', 'ecod') THEN
    RAISE EXCEPTION 'Invalid payment method' USING ERRCODE = '22023';
  END IF;

  v_verified_name := NULLIF(regexp_replace(trim(coalesce(p_verified_name, '')), '\s+', '_', 'g'), '');

  UPDATE public.clients
     SET account_balance = account_balance + p_amount,
         updated_at = now()
   WHERE id = p_client_id
   RETURNING account_balance INTO v_new_balance;

  IF v_new_balance IS NULL THEN
    RAISE EXCEPTION 'Client not found' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.client_account_transactions (
    client_id, type, amount, transaction_date, running_balance, method, reference, notes,
    verified_name, verified_by, verified_at, created_by
  ) VALUES (
    p_client_id, 'deposit', p_amount,
    COALESCE(p_transaction_date, CURRENT_DATE),
    v_new_balance, p_method,
    NULLIF(trim(p_reference), ''), NULLIF(trim(p_notes), ''),
    v_verified_name, v_user_id, now(), v_user_id
  )
  RETURNING id INTO v_transaction_id;

  RETURN v_transaction_id;
END;
$$;

-- Apply balance (wallet → invoices) — used by Pay Invoices from Balance
CREATE OR REPLACE FUNCTION public.apply_client_account_balance(
  p_client_id uuid,
  p_invoice_ids uuid[],
  p_amounts numeric[],
  p_notes text DEFAULT NULL,
  p_verified_name text DEFAULT NULL
) RETURNS uuid[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_transaction_ids uuid[] := '{}';
  v_total_to_apply numeric := 0;
  v_current_balance numeric;
  v_invoice_id uuid;
  v_amount numeric;
  v_invoice_total numeric;
  v_invoice_paid numeric;
  v_payment_id uuid;
  v_transaction_id uuid;
  v_verified_name text;
  i int;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  IF NOT (
    public.is_admin()
    OR (public.has_staff_permission('clients_manage_account') AND public.has_staff_permission('clients_see_money'))
  ) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF array_length(p_invoice_ids, 1) IS NULL
     OR array_length(p_invoice_ids, 1) <> coalesce(array_length(p_amounts, 1), 0) THEN
    RAISE EXCEPTION 'Invoice and amount arrays must match' USING ERRCODE = '22023';
  END IF;

  FOREACH v_amount IN ARRAY p_amounts LOOP
    IF v_amount IS NULL OR v_amount <= 0 THEN
      RAISE EXCEPTION 'Each amount must be greater than zero' USING ERRCODE = '22023';
    END IF;
    v_total_to_apply := v_total_to_apply + v_amount;
  END LOOP;

  IF v_total_to_apply <= 0 THEN
    RAISE EXCEPTION 'Nothing to apply' USING ERRCODE = '22023';
  END IF;

  SELECT account_balance INTO v_current_balance
    FROM public.clients
   WHERE id = p_client_id
   FOR UPDATE;

  IF v_current_balance IS NULL THEN
    RAISE EXCEPTION 'Client not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_total_to_apply > v_current_balance THEN
    RAISE EXCEPTION 'Insufficient account balance. Available: %, requested: %',
      v_current_balance, v_total_to_apply
      USING ERRCODE = '23514';
  END IF;

  v_verified_name := NULLIF(regexp_replace(trim(coalesce(p_verified_name, '')), '\s+', '_', 'g'), '');

  FOR i IN 1..array_length(p_invoice_ids, 1) LOOP
    v_invoice_id := p_invoice_ids[i];
    v_amount := p_amounts[i];

    SELECT total, amount_paid INTO v_invoice_total, v_invoice_paid
      FROM public.invoices
     WHERE id = v_invoice_id
       AND client_id = p_client_id
       AND type = 'invoice'
       AND deleted_at IS NULL
       AND status IN ('sent', 'partial', 'overdue', 'due')
     FOR UPDATE;

    IF v_invoice_total IS NULL THEN
      RAISE EXCEPTION 'Invoice % not found', v_invoice_id USING ERRCODE = 'P0002';
    END IF;

    IF v_invoice_total - v_invoice_paid < v_amount THEN
      RAISE EXCEPTION 'Amount % exceeds remaining balance on invoice %',
        v_amount, v_invoice_id
        USING ERRCODE = '23514';
    END IF;

    INSERT INTO public.payments (
      invoice_id, amount, payment_date, method, reference, notes, source, created_by
    ) VALUES (
      v_invoice_id, v_amount, CURRENT_DATE, 'other', NULL,
      NULLIF(trim(p_notes), ''), 'client_account', v_user_id
    )
    RETURNING id INTO v_payment_id;

    v_current_balance := v_current_balance - v_amount;

    UPDATE public.clients
       SET account_balance = v_current_balance,
           updated_at = now()
     WHERE id = p_client_id;

    INSERT INTO public.client_account_transactions (
      client_id, type, amount, running_balance, invoice_id, payment_id, method, notes,
      verified_name, verified_by, verified_at, created_by
    ) VALUES (
      p_client_id, 'allocation', v_amount, v_current_balance, v_invoice_id,
      v_payment_id, 'other', NULLIF(trim(p_notes), ''),
      v_verified_name, v_user_id, now(), v_user_id
    )
    RETURNING id INTO v_transaction_id;

    v_transaction_ids := array_append(v_transaction_ids, v_transaction_id);
  END LOOP;

  RETURN v_transaction_ids;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.deposit_to_client_account(uuid, numeric, text, text, text, text, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.deposit_to_client_account(uuid, numeric, text, text, text, text, date) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.apply_client_account_balance(uuid, uuid[], numeric[], text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_client_account_balance(uuid, uuid[], numeric[], text, text) TO authenticated, service_role;

-- Older 4-arg overload some app versions still call
CREATE OR REPLACE FUNCTION public.apply_client_account_balance(
  p_client_id uuid,
  p_invoice_ids uuid[],
  p_amounts numeric[],
  p_notes text DEFAULT NULL
) RETURNS uuid[]
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.apply_client_account_balance(p_client_id, p_invoice_ids, p_amounts, p_notes, NULL);
$$;

REVOKE EXECUTE ON FUNCTION public.apply_client_account_balance(uuid, uuid[], numeric[], text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_client_account_balance(uuid, uuid[], numeric[], text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.log_client_account_action(text, uuid, numeric, text, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_client_account_action(text, uuid, numeric, text, text, text, jsonb) TO authenticated, service_role;

GRANT SELECT ON public.client_account_transactions TO authenticated;
GRANT SELECT, INSERT ON public.client_account_audit_log TO authenticated;

SELECT
  EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'deposit_to_client_account'
  ) AS has_deposit_rpc,
  (SELECT count(*) FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'client_account_transactions') AS has_ledger;
