-- Add the 'picker' role and picking-status tracking to invoices.
-- This is the foundation for the warehouse mobile picking workflow.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Expand profiles.role to include 'picker'
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  -- Widen the CHECK constraint if it still only knows admin/staff/client.
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'profiles_role_check'
      AND pg_get_constraintdef(oid) NOT LIKE '%picker%'
  ) THEN
    ALTER TABLE public.profiles
      DROP CONSTRAINT profiles_role_check;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_role_check'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_role_check
      CHECK (role IN ('admin', 'staff', 'client', 'picker'));
  END IF;
END $$;

-- The role-client match constraint already handles any non-client role,
-- so picker (like admin/staff) simply needs client_id IS NULL.

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Honour invited_role = 'picker' when a user is invited
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account_number text;
  v_role text;
BEGIN
  v_role := COALESCE(NEW.raw_user_meta_data->>'invited_role', 'staff');
  IF v_role NOT IN ('admin', 'staff', 'client', 'picker') THEN
    v_role := 'staff';
  END IF;

  v_account_number := public.generate_unique_account_number();

  INSERT INTO public.profiles (id, email, full_name, role, is_active, created_by, account_number)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    v_role,
    true,
    NEW.id,
    v_account_number
  );

  RETURN NEW;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Picking status on invoices
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS picking_status text NOT NULL DEFAULT 'not_started'
    CHECK (picking_status IN (
      'not_started','in_progress','partially_loaded','loaded','completed','delivered'
    )),
  ADD COLUMN IF NOT EXISTS picking_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS picking_loaded_at timestamptz,
  ADD COLUMN IF NOT EXISTS picking_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS picking_delivered_at timestamptz;

-- Existing sent invoices start as not_started so they appear in the picker queue.
UPDATE public.invoices
   SET picking_status = 'not_started'
 WHERE status = 'sent'
   AND picking_status = 'not_started';

-- Index to make the picker queue fast.
CREATE INDEX IF NOT EXISTS idx_invoices_picking_status
  ON public.invoices(status, picking_status, created_at);
