-- ─────────────────────────────────────────────────────────────────────────────
-- 139: Race-safe client quote reference numbers
--
-- createClientQuote used to compute CQ-NNNNN as (count of client_quotes) + 1
-- through the USER client. RLS scopes that count to the caller's own rows, so
-- the second client ever computed CQ-00001 and hit the UNIQUE constraint —
-- and concurrent submissions raced regardless. This mirrors the row-locked
-- sequence pattern already used for invoice document numbers (migration 024).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.client_quote_number_sequence (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  next_number bigint NOT NULL
);

-- Seed from the highest existing CQ-NNNNN so new numbers never collide with
-- history (tolerates non-standard reference formats via NULL-safe substring).
INSERT INTO public.client_quote_number_sequence (id, next_number)
SELECT 1,
       COALESCE(
         (SELECT max((substring(reference_number from 'CQ-([0-9]+)'))::bigint)
          FROM public.client_quotes),
         0
       ) + 1
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.generate_client_quote_reference()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next bigint;
BEGIN
  -- Single-row table: the UPDATE takes a row lock, serialising concurrent
  -- callers so each gets a distinct number.
  UPDATE public.client_quote_number_sequence
  SET next_number = next_number + 1
  WHERE id = 1
  RETURNING next_number - 1 INTO v_next;

  RETURN 'CQ-' || lpad(v_next::text, 5, '0');
END;
$$;

REVOKE ALL ON FUNCTION public.generate_client_quote_reference() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_client_quote_reference() TO authenticated;
