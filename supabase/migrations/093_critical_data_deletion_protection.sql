-- =============================================================================
-- Star Hawk Builders Merchant — 093_critical_data_deletion_protection.sql
-- =============================================================================
-- Soft-delete + password-protected deletion for clients, products, invoices
-- (and their children). Even code holding the service-role key cannot hard-
-- delete or directly set deleted_at on these tables; it must call the
-- password-verifying RPCs defined below.
--
-- Idempotent: every statement uses IF NOT EXISTS / CREATE OR REPLACE /
-- DROP POLICY IF EXISTS / GRANT/REVOKE idempotently where possible.
-- =============================================================================

-- ┌───────────────────────────────────────────────────────────────────────────┐
-- │ A. Extensions                                                             │
-- └───────────────────────────────────────────────────────────────────────────┘

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ┌───────────────────────────────────────────────────────────────────────────┐
-- │ B. Soft-delete columns                                                    │
-- └───────────────────────────────────────────────────────────────────────────┘

ALTER TABLE public.clients      ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.products     ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.invoices     ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.invoice_items ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.payments     ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- ┌───────────────────────────────────────────────────────────────────────────┐
-- │ C. Indexes for the deleted view / active filters                          │
-- └───────────────────────────────────────────────────────────────────────────┘

CREATE INDEX IF NOT EXISTS idx_clients_deleted_at
  ON public.clients(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_products_deleted_at
  ON public.products(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_deleted_at
  ON public.invoices(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invoice_items_deleted_at
  ON public.invoice_items(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payments_deleted_at
  ON public.payments(deleted_at) WHERE deleted_at IS NOT NULL;

-- Composite index so the dashboard can quickly show "recently deleted" records.
CREATE INDEX IF NOT EXISTS idx_invoices_deleted_at_performed
  ON public.invoices(deleted_at, updated_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_clients_deleted_at_performed
  ON public.clients(deleted_at, updated_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_products_deleted_at_performed
  ON public.products(deleted_at, updated_at) WHERE deleted_at IS NOT NULL;

-- ┌───────────────────────────────────────────────────────────────────────────┐
-- │ D. Secrets table (deletion password hash)                                 │
-- └───────────────────────────────────────────────────────────────────────────┘

CREATE TABLE IF NOT EXISTS public.app_secrets (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  deletion_password_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.app_secrets IS
  'Single-row table for application-wide secrets. The deletion password is stored as a bcrypt hash; plaintext lives only in the admin head.';

ALTER TABLE public.app_secrets ENABLE ROW LEVEL SECURITY;

-- No SELECT/INSERT/UPDATE/DELETE policies for authenticated/anon.
-- service_role also loses direct DML below so the password-verifying RPCs
-- are the only way to read or change the hash.

DROP TRIGGER IF EXISTS app_secrets_touch_updated_at ON public.app_secrets;
CREATE TRIGGER app_secrets_touch_updated_at
  BEFORE UPDATE ON public.app_secrets
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ┌───────────────────────────────────────────────────────────────────────────┐
-- │ E. Deletion-specific audit log                                            │
-- └───────────────────────────────────────────────────────────────────────────┘

CREATE TABLE IF NOT EXISTS public.deletion_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action text NOT NULL CHECK (action IN (
    'soft_delete', 'restore', 'password_change', 'failed_attempt', 'rate_limited'
  )),
  target_table text,
  target_id uuid,
  performed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  performed_at timestamptz NOT NULL DEFAULT now(),
  ip_address text,
  user_agent text,
  success boolean NOT NULL DEFAULT true,
  details jsonb
);

COMMENT ON TABLE public.deletion_audit_log IS
  'Fine-grained audit trail for delete/restore actions and password attempts.';

ALTER TABLE public.deletion_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS deletion_audit_log_select ON public.deletion_audit_log;
CREATE POLICY deletion_audit_log_select ON public.deletion_audit_log
  FOR SELECT TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS deletion_audit_log_insert ON public.deletion_audit_log;
CREATE POLICY deletion_audit_log_insert ON public.deletion_audit_log
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());

-- ┌───────────────────────────────────────────────────────────────────────────┐
-- │ F. Shared result type                                                     │
-- └───────────────────────────────────────────────────────────────────────────┘

DROP TYPE IF EXISTS public.deletion_result CASCADE;
CREATE TYPE public.deletion_result AS (
  success boolean,
  error_code text,
  message text
);

-- ┌───────────────────────────────────────────────────────────────────────────┐
-- │ G. Secret / password helpers                                              │
-- └───────────────────────────────────────────────────────────────────────────┘

CREATE OR REPLACE FUNCTION public.get_deletion_password_hash()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT deletion_password_hash FROM public.app_secrets WHERE id = 1;
$$;

CREATE OR REPLACE FUNCTION public.verify_deletion_password(p_password text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
STABLE
AS $$
DECLARE
  v_hash text;
BEGIN
  SELECT deletion_password_hash INTO v_hash FROM public.app_secrets WHERE id = 1;
  IF v_hash IS NULL THEN
    RETURN false;
  END IF;
  RETURN crypt(p_password, v_hash) = v_hash;
END;
$$;

-- Admin-only initial setup. Should only succeed when the hash is NULL or the
-- caller is an admin and intentionally re-initialising.
CREATE OR REPLACE FUNCTION public.set_deletion_password(p_new_password text)
RETURNS public.deletion_result
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_hash text;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN (false, 'unauthorized', 'Only admins can set the deletion password.')::public.deletion_result;
  END IF;
  IF p_new_password IS NULL OR length(p_new_password) < 8 THEN
    RETURN (false, 'weak_password', 'Password must be at least 8 characters.')::public.deletion_result;
  END IF;

  v_hash := crypt(p_new_password, gen_salt('bf'));

  INSERT INTO public.app_secrets (id, deletion_password_hash)
  VALUES (1, v_hash)
  ON CONFLICT (id) DO UPDATE
    SET deletion_password_hash = EXCLUDED.deletion_password_hash,
        updated_at = now();

  PERFORM public.log_deletion_event(
    'password_change', 'app_secrets', NULL, NULL, NULL, true,
    jsonb_build_object('operation', 'set')
  );

  RETURN (true, NULL, 'Deletion password set successfully.')::public.deletion_result;
END;
$$;

-- Change the deletion password. Requires the current password unless no
-- password has been set yet (first-run scenario).
CREATE OR REPLACE FUNCTION public.change_deletion_password(
  p_current_password text,
  p_new_password text
)
RETURNS public.deletion_result
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_hash text;
  v_new_hash text;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN (false, 'unauthorized', 'Only admins can change the deletion password.')::public.deletion_result;
  END IF;

  SELECT deletion_password_hash INTO v_hash FROM public.app_secrets WHERE id = 1;

  IF v_hash IS NOT NULL AND NOT public.verify_deletion_password(p_current_password) THEN
    PERFORM public.log_deletion_event(
      'failed_attempt', 'app_secrets', NULL, NULL, NULL, false,
      jsonb_build_object('reason', 'wrong_password', 'operation', 'change')
    );
    RETURN (false, 'wrong_password', 'Current deletion password is incorrect.')::public.deletion_result;
  END IF;

  IF p_new_password IS NULL OR length(p_new_password) < 8 THEN
    RETURN (false, 'weak_password', 'Password must be at least 8 characters.')::public.deletion_result;
  END IF;

  v_new_hash := crypt(p_new_password, gen_salt('bf'));

  INSERT INTO public.app_secrets (id, deletion_password_hash)
  VALUES (1, v_new_hash)
  ON CONFLICT (id) DO UPDATE
    SET deletion_password_hash = EXCLUDED.deletion_password_hash,
        updated_at = now();

  PERFORM public.log_deletion_event(
    'password_change', 'app_secrets', NULL, NULL, NULL, true,
    jsonb_build_object('operation', 'change')
  );

  RETURN (true, NULL, 'Deletion password changed successfully.')::public.deletion_result;
END;
$$;

-- ┌───────────────────────────────────────────────────────────────────────────┐
-- │ H. Logging helper                                                         │
-- └───────────────────────────────────────────────────────────────────────────┘

CREATE OR REPLACE FUNCTION public.log_deletion_event(
  p_action text,
  p_target_table text,
  p_target_id uuid,
  p_ip_address text,
  p_user_agent text,
  p_success boolean,
  p_details jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.deletion_audit_log (
    action, target_table, target_id, performed_by,
    ip_address, user_agent, success, details
  ) VALUES (
    p_action, p_target_table, p_target_id, auth.uid(),
    p_ip_address, p_user_agent, p_success, p_details
  );
END;
$$;

-- ┌───────────────────────────────────────────────────────────────────────────┐
-- │ I. Per-record authorization helpers                                       │
-- └───────────────────────────────────────────────────────────────────────────┘

CREATE OR REPLACE FUNCTION public.user_can_delete_client(p_user_id uuid, p_client_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.clients c ON c.id = p_client_id
    WHERE p.id = p_user_id
      AND (
        p.role = 'admin'
        OR (
          c.created_by = p_user_id
          AND COALESCE((p.permissions->>'clients_delete')::boolean, false)
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.user_can_delete_product(p_user_id uuid, p_product_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.products pr ON pr.id = p_product_id
    WHERE p.id = p_user_id
      AND (
        p.role = 'admin'
        OR (
          pr.created_by = p_user_id
          AND COALESCE((p.permissions->>'products_delete')::boolean, false)
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.user_can_delete_invoice(p_user_id uuid, p_invoice_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.invoices i ON i.id = p_invoice_id
    WHERE p.id = p_user_id
      AND (
        p.role = 'admin'
        OR (
          i.created_by = p_user_id
          AND COALESCE((p.permissions->>'invoices_delete')::boolean, false)
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.user_can_delete_payment(p_user_id uuid, p_payment_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.payments pay ON pay.id = p_payment_id
    JOIN public.invoices i ON i.id = pay.invoice_id
    WHERE p.id = p_user_id
      AND (
        p.role = 'admin'
        OR (
          i.created_by = p_user_id
          AND COALESCE((p.permissions->>'invoices_delete_payment')::boolean, false)
        )
      )
  );
$$;

-- ┌───────────────────────────────────────────────────────────────────────────┐
-- │ J. Soft-delete RPCs                                                       │
-- └───────────────────────────────────────────────────────────────────────────┘

CREATE OR REPLACE FUNCTION public.soft_delete_client(
  p_client_id uuid,
  p_password text,
  p_ip_address text DEFAULT NULL,
  p_user_agent text DEFAULT NULL
)
RETURNS public.deletion_result
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_attempt_count integer;
  v_success_count integer;
  v_global_count integer;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN (false, 'unauthenticated', 'You must be signed in.')::public.deletion_result;
  END IF;

  -- Per-IP attempt limit (brute-force protection). Counts every call.
  IF p_ip_address IS NOT NULL THEN
    v_attempt_count := public.check_rate_limit('delete-attempt:' || p_ip_address, 10, 600);
    IF v_attempt_count > 10 THEN
      PERFORM public.log_deletion_event(
        'rate_limited', 'clients', p_client_id, p_ip_address, p_user_agent, false,
        jsonb_build_object('reason', 'too_many_attempts')
      );
      RETURN (false, 'rate_limited', 'Too many deletion attempts. Please try again later.')::public.deletion_result;
    END IF;
  END IF;

  -- Password check
  IF NOT public.verify_deletion_password(p_password) THEN
    PERFORM public.log_deletion_event(
      'failed_attempt', 'clients', p_client_id, p_ip_address, p_user_agent, false,
      jsonb_build_object('reason', 'wrong_password')
    );
    RETURN (false, 'wrong_password', 'Deletion password is incorrect.')::public.deletion_result;
  END IF;

  -- Per-user success limit
  v_success_count := public.check_rate_limit('delete-success:' || v_user_id::text, 3, 600);
  IF v_success_count > 3 THEN
    PERFORM public.log_deletion_event(
      'rate_limited', 'clients', p_client_id, p_ip_address, p_user_agent, false,
      jsonb_build_object('reason', 'per_user_limit')
    );
    RETURN (false, 'rate_limited', 'Deletion limit reached. Please try again later.')::public.deletion_result;
  END IF;

  -- Global success limit (circuit breaker)
  v_global_count := public.check_rate_limit('delete-success:global', 10, 600);
  IF v_global_count > 10 THEN
    PERFORM public.log_deletion_event(
      'rate_limited', 'clients', p_client_id, p_ip_address, p_user_agent, false,
      jsonb_build_object('reason', 'global_limit')
    );
    RETURN (false, 'rate_limited', 'Global deletion limit reached. Please try again later.')::public.deletion_result;
  END IF;

  -- Record-level authorization
  IF NOT public.user_can_delete_client(v_user_id, p_client_id) THEN
    RETURN (false, 'unauthorized', 'You are not allowed to delete this client.')::public.deletion_result;
  END IF;

  -- Preserve the legacy rule: a client with live invoices cannot be deleted.
  IF EXISTS (
    SELECT 1 FROM public.invoices
    WHERE client_id = p_client_id AND deleted_at IS NULL
  ) THEN
    RETURN (false, 'has_invoices', 'Cannot delete a client that has invoices.')::public.deletion_result;
  END IF;

  UPDATE public.clients
     SET deleted_at = now()
   WHERE id = p_client_id
     AND deleted_at IS NULL;

  PERFORM public.log_deletion_event(
    'soft_delete', 'clients', p_client_id, p_ip_address, p_user_agent, true, NULL
  );

  RETURN (true, NULL, 'Client deleted.')::public.deletion_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.soft_delete_product(
  p_product_id uuid,
  p_password text,
  p_ip_address text DEFAULT NULL,
  p_user_agent text DEFAULT NULL
)
RETURNS public.deletion_result
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_attempt_count integer;
  v_success_count integer;
  v_global_count integer;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN (false, 'unauthenticated', 'You must be signed in.')::public.deletion_result;
  END IF;

  IF p_ip_address IS NOT NULL THEN
    v_attempt_count := public.check_rate_limit('delete-attempt:' || p_ip_address, 10, 600);
    IF v_attempt_count > 10 THEN
      PERFORM public.log_deletion_event(
        'rate_limited', 'products', p_product_id, p_ip_address, p_user_agent, false,
        jsonb_build_object('reason', 'too_many_attempts')
      );
      RETURN (false, 'rate_limited', 'Too many deletion attempts. Please try again later.')::public.deletion_result;
    END IF;
  END IF;

  IF NOT public.verify_deletion_password(p_password) THEN
    PERFORM public.log_deletion_event(
      'failed_attempt', 'products', p_product_id, p_ip_address, p_user_agent, false,
      jsonb_build_object('reason', 'wrong_password')
    );
    RETURN (false, 'wrong_password', 'Deletion password is incorrect.')::public.deletion_result;
  END IF;

  v_success_count := public.check_rate_limit('delete-success:' || v_user_id::text, 3, 600);
  IF v_success_count > 3 THEN
    PERFORM public.log_deletion_event(
      'rate_limited', 'products', p_product_id, p_ip_address, p_user_agent, false,
      jsonb_build_object('reason', 'per_user_limit')
    );
    RETURN (false, 'rate_limited', 'Deletion limit reached. Please try again later.')::public.deletion_result;
  END IF;

  v_global_count := public.check_rate_limit('delete-success:global', 10, 600);
  IF v_global_count > 10 THEN
    PERFORM public.log_deletion_event(
      'rate_limited', 'products', p_product_id, p_ip_address, p_user_agent, false,
      jsonb_build_object('reason', 'global_limit')
    );
    RETURN (false, 'rate_limited', 'Global deletion limit reached. Please try again later.')::public.deletion_result;
  END IF;

  IF NOT public.user_can_delete_product(v_user_id, p_product_id) THEN
    RETURN (false, 'unauthorized', 'You are not allowed to delete this product.')::public.deletion_result;
  END IF;

  UPDATE public.products
     SET deleted_at = now()
   WHERE id = p_product_id
     AND deleted_at IS NULL;

  PERFORM public.log_deletion_event(
    'soft_delete', 'products', p_product_id, p_ip_address, p_user_agent, true, NULL
  );

  RETURN (true, NULL, 'Product deleted.')::public.deletion_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.soft_delete_invoice(
  p_invoice_id uuid,
  p_password text,
  p_ip_address text DEFAULT NULL,
  p_user_agent text DEFAULT NULL
)
RETURNS public.deletion_result
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_attempt_count integer;
  v_success_count integer;
  v_global_count integer;
  v_invoice public.invoices%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN (false, 'unauthenticated', 'You must be signed in.')::public.deletion_result;
  END IF;

  IF p_ip_address IS NOT NULL THEN
    v_attempt_count := public.check_rate_limit('delete-attempt:' || p_ip_address, 10, 600);
    IF v_attempt_count > 10 THEN
      PERFORM public.log_deletion_event(
        'rate_limited', 'invoices', p_invoice_id, p_ip_address, p_user_agent, false,
        jsonb_build_object('reason', 'too_many_attempts')
      );
      RETURN (false, 'rate_limited', 'Too many deletion attempts. Please try again later.')::public.deletion_result;
    END IF;
  END IF;

  IF NOT public.verify_deletion_password(p_password) THEN
    PERFORM public.log_deletion_event(
      'failed_attempt', 'invoices', p_invoice_id, p_ip_address, p_user_agent, false,
      jsonb_build_object('reason', 'wrong_password')
    );
    RETURN (false, 'wrong_password', 'Deletion password is incorrect.')::public.deletion_result;
  END IF;

  v_success_count := public.check_rate_limit('delete-success:' || v_user_id::text, 3, 600);
  IF v_success_count > 3 THEN
    PERFORM public.log_deletion_event(
      'rate_limited', 'invoices', p_invoice_id, p_ip_address, p_user_agent, false,
      jsonb_build_object('reason', 'per_user_limit')
    );
    RETURN (false, 'rate_limited', 'Deletion limit reached. Please try again later.')::public.deletion_result;
  END IF;

  v_global_count := public.check_rate_limit('delete-success:global', 10, 600);
  IF v_global_count > 10 THEN
    PERFORM public.log_deletion_event(
      'rate_limited', 'invoices', p_invoice_id, p_ip_address, p_user_agent, false,
      jsonb_build_object('reason', 'global_limit')
    );
    RETURN (false, 'rate_limited', 'Global deletion limit reached. Please try again later.')::public.deletion_result;
  END IF;

  SELECT * INTO v_invoice FROM public.invoices
   WHERE id = p_invoice_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RETURN (false, 'not_found', 'Invoice not found.')::public.deletion_result;
  END IF;

  IF NOT public.user_can_delete_invoice(v_user_id, p_invoice_id) THEN
    RETURN (false, 'unauthorized', 'You are not allowed to delete this invoice.')::public.deletion_result;
  END IF;

  -- Paid/partial/converted (or any payment applied) still require admin.
  IF (
    v_invoice.status IN ('paid', 'partial', 'converted')
    OR COALESCE(v_invoice.amount_paid, 0) > 0
  ) AND NOT public.is_admin() THEN
    RETURN (false, 'protected_status', 'Only admins can delete paid, partial, or converted documents.')::public.deletion_result;
  END IF;

  UPDATE public.invoices     SET deleted_at = now() WHERE id = p_invoice_id;
  UPDATE public.invoice_items SET deleted_at = now() WHERE invoice_id = p_invoice_id;
  UPDATE public.payments     SET deleted_at = now() WHERE invoice_id = p_invoice_id;

  PERFORM public.log_deletion_event(
    'soft_delete', 'invoices', p_invoice_id, p_ip_address, p_user_agent, true, NULL
  );

  RETURN (true, NULL, 'Invoice deleted.')::public.deletion_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.soft_delete_payment(
  p_payment_id uuid,
  p_password text,
  p_ip_address text DEFAULT NULL,
  p_user_agent text DEFAULT NULL
)
RETURNS public.deletion_result
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_attempt_count integer;
  v_success_count integer;
  v_global_count integer;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN (false, 'unauthenticated', 'You must be signed in.')::public.deletion_result;
  END IF;

  IF p_ip_address IS NOT NULL THEN
    v_attempt_count := public.check_rate_limit('delete-attempt:' || p_ip_address, 10, 600);
    IF v_attempt_count > 10 THEN
      PERFORM public.log_deletion_event(
        'rate_limited', 'payments', p_payment_id, p_ip_address, p_user_agent, false,
        jsonb_build_object('reason', 'too_many_attempts')
      );
      RETURN (false, 'rate_limited', 'Too many deletion attempts. Please try again later.')::public.deletion_result;
    END IF;
  END IF;

  IF NOT public.verify_deletion_password(p_password) THEN
    PERFORM public.log_deletion_event(
      'failed_attempt', 'payments', p_payment_id, p_ip_address, p_user_agent, false,
      jsonb_build_object('reason', 'wrong_password')
    );
    RETURN (false, 'wrong_password', 'Deletion password is incorrect.')::public.deletion_result;
  END IF;

  v_success_count := public.check_rate_limit('delete-success:' || v_user_id::text, 3, 600);
  IF v_success_count > 3 THEN
    PERFORM public.log_deletion_event(
      'rate_limited', 'payments', p_payment_id, p_ip_address, p_user_agent, false,
      jsonb_build_object('reason', 'per_user_limit')
    );
    RETURN (false, 'rate_limited', 'Deletion limit reached. Please try again later.')::public.deletion_result;
  END IF;

  v_global_count := public.check_rate_limit('delete-success:global', 10, 600);
  IF v_global_count > 10 THEN
    PERFORM public.log_deletion_event(
      'rate_limited', 'payments', p_payment_id, p_ip_address, p_user_agent, false,
      jsonb_build_object('reason', 'global_limit')
    );
    RETURN (false, 'rate_limited', 'Global deletion limit reached. Please try again later.')::public.deletion_result;
  END IF;

  IF NOT public.user_can_delete_payment(v_user_id, p_payment_id) THEN
    RETURN (false, 'unauthorized', 'You are not allowed to delete this payment.')::public.deletion_result;
  END IF;

  UPDATE public.payments
     SET deleted_at = now()
   WHERE id = p_payment_id
     AND deleted_at IS NULL;

  PERFORM public.log_deletion_event(
    'soft_delete', 'payments', p_payment_id, p_ip_address, p_user_agent, true, NULL
  );

  RETURN (true, NULL, 'Payment deleted.')::public.deletion_result;
END;
$$;

-- ┌───────────────────────────────────────────────────────────────────────────┐
-- │ K. Restore RPCs                                                           │
-- └───────────────────────────────────────────────────────────────────────────┘

CREATE OR REPLACE FUNCTION public.restore_client(
  p_client_id uuid,
  p_password text,
  p_ip_address text DEFAULT NULL,
  p_user_agent text DEFAULT NULL
)
RETURNS public.deletion_result
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RETURN (false, 'unauthenticated', 'You must be signed in.')::public.deletion_result;
  END IF;

  IF NOT public.verify_deletion_password(p_password) THEN
    RETURN (false, 'wrong_password', 'Deletion password is incorrect.')::public.deletion_result;
  END IF;

  IF NOT public.user_can_delete_client(v_user_id, p_client_id) THEN
    RETURN (false, 'unauthorized', 'You are not allowed to restore this client.')::public.deletion_result;
  END IF;

  UPDATE public.clients SET deleted_at = NULL WHERE id = p_client_id;

  PERFORM public.log_deletion_event(
    'restore', 'clients', p_client_id, p_ip_address, p_user_agent, true, NULL
  );

  RETURN (true, NULL, 'Client restored.')::public.deletion_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.restore_product(
  p_product_id uuid,
  p_password text,
  p_ip_address text DEFAULT NULL,
  p_user_agent text DEFAULT NULL
)
RETURNS public.deletion_result
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RETURN (false, 'unauthenticated', 'You must be signed in.')::public.deletion_result;
  END IF;

  IF NOT public.verify_deletion_password(p_password) THEN
    RETURN (false, 'wrong_password', 'Deletion password is incorrect.')::public.deletion_result;
  END IF;

  IF NOT public.user_can_delete_product(v_user_id, p_product_id) THEN
    RETURN (false, 'unauthorized', 'You are not allowed to restore this product.')::public.deletion_result;
  END IF;

  UPDATE public.products SET deleted_at = NULL WHERE id = p_product_id;

  PERFORM public.log_deletion_event(
    'restore', 'products', p_product_id, p_ip_address, p_user_agent, true, NULL
  );

  RETURN (true, NULL, 'Product restored.')::public.deletion_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.restore_invoice(
  p_invoice_id uuid,
  p_password text,
  p_ip_address text DEFAULT NULL,
  p_user_agent text DEFAULT NULL
)
RETURNS public.deletion_result
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RETURN (false, 'unauthenticated', 'You must be signed in.')::public.deletion_result;
  END IF;

  IF NOT public.verify_deletion_password(p_password) THEN
    RETURN (false, 'wrong_password', 'Deletion password is incorrect.')::public.deletion_result;
  END IF;

  IF NOT public.user_can_delete_invoice(v_user_id, p_invoice_id) THEN
    RETURN (false, 'unauthorized', 'You are not allowed to restore this invoice.')::public.deletion_result;
  END IF;

  UPDATE public.invoices     SET deleted_at = NULL WHERE id = p_invoice_id;
  UPDATE public.invoice_items SET deleted_at = NULL WHERE invoice_id = p_invoice_id;
  UPDATE public.payments     SET deleted_at = NULL WHERE invoice_id = p_invoice_id;

  PERFORM public.log_deletion_event(
    'restore', 'invoices', p_invoice_id, p_ip_address, p_user_agent, true, NULL
  );

  RETURN (true, NULL, 'Invoice restored.')::public.deletion_result;
END;
$$;

-- ┌───────────────────────────────────────────────────────────────────────────┐
-- │ L. Internal cleanup helper (replaces bestEffortDelete)                    │
-- └───────────────────────────────────────────────────────────────────────────┘

-- Allows a signed-in user to hard-delete only their own draft invoices that
-- were created in the last hour. This is the rollback path for failed multi-
-- step creates; it is intentionally narrow and never exposed in the UI.
CREATE OR REPLACE FUNCTION public.hard_delete_draft_invoice(p_invoice_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RETURN false;
  END IF;

  DELETE FROM public.invoices
   WHERE id = p_invoice_id
     AND status = 'draft'
     AND created_by = v_user_id
     AND created_at > now() - interval '1 hour';

  RETURN FOUND;
END;
$$;

-- ┌───────────────────────────────────────────────────────────────────────────┐
-- │ M. Privilege restrictions — the enforcement layer                         │
-- └───────────────────────────────────────────────────────────────────────────┘

-- Direct hard deletes on critical tables are forbidden to application roles.
REVOKE DELETE ON public.clients      FROM authenticated, service_role;
REVOKE DELETE ON public.products     FROM authenticated, service_role;
REVOKE DELETE ON public.invoices     FROM authenticated, service_role;
REVOKE DELETE ON public.invoice_items FROM authenticated, service_role;
REVOKE DELETE ON public.payments     FROM authenticated, service_role;

-- Direct manipulation of the soft-delete column is also forbidden.
REVOKE UPDATE (deleted_at) ON public.clients      FROM authenticated, service_role;
REVOKE UPDATE (deleted_at) ON public.products     FROM authenticated, service_role;
REVOKE UPDATE (deleted_at) ON public.invoices     FROM authenticated, service_role;
REVOKE UPDATE (deleted_at) ON public.invoice_items FROM authenticated, service_role;
REVOKE UPDATE (deleted_at) ON public.payments     FROM authenticated, service_role;

-- app_secrets is only reachable through the password-verifying RPCs.
REVOKE ALL ON public.app_secrets FROM authenticated, anon, service_role;

-- ┌───────────────────────────────────────────────────────────────────────────┐
-- │ N. Grants — expose the safe RPC surface                                   │
-- └───────────────────────────────────────────────────────────────────────────┘

GRANT EXECUTE ON FUNCTION public.soft_delete_client(uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.soft_delete_product(uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.soft_delete_invoice(uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.soft_delete_payment(uuid, text, text, text) TO authenticated;

GRANT EXECUTE ON FUNCTION public.restore_client(uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_product(uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_invoice(uuid, text, text, text) TO authenticated;

GRANT EXECUTE ON FUNCTION public.hard_delete_draft_invoice(uuid) TO authenticated;

GRANT EXECUTE ON FUNCTION public.set_deletion_password(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.change_deletion_password(text, text) TO authenticated;

-- service_role is used by server actions; it also needs to call the safe RPCs.
GRANT EXECUTE ON FUNCTION public.soft_delete_client(uuid, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.soft_delete_product(uuid, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.soft_delete_invoice(uuid, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.soft_delete_payment(uuid, text, text, text) TO service_role;

GRANT EXECUTE ON FUNCTION public.restore_client(uuid, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.restore_product(uuid, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.restore_invoice(uuid, text, text, text) TO service_role;

GRANT EXECUTE ON FUNCTION public.hard_delete_draft_invoice(uuid) TO service_role;

GRANT EXECUTE ON FUNCTION public.get_deletion_password_hash() TO service_role;
GRANT EXECUTE ON FUNCTION public.set_deletion_password(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.change_deletion_password(text, text) TO service_role;

-- Read-only audit access for service_role (used by the dashboard log view).
GRANT SELECT ON public.deletion_audit_log TO service_role;
GRANT SELECT ON public.deletion_audit_log TO authenticated;
