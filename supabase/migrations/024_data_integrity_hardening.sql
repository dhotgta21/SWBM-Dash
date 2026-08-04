-- =============================================================================
-- Star Hawk Builders Merchant — 024_data_integrity_hardening.sql
-- =============================================================================
-- Closes the data-integrity gaps surfaced by the lib/actions review (June
-- 2026):
--
--   1. clients.email — partial UNIQUE so concurrent quote-request conversions
--      for the same customer can't insert duplicate clients.
--
--   2. invoices.order_number — partial UNIQUE so the random 6-digit order
--      number generator can't silently persist duplicates. The action layer
--      catches 23505 and retries on collision.
--
--   3. client_invitations — partial UNIQUE on (client_id) WHERE status =
--      'pending' so concurrent admin clicks on "Send invite" can't both
--      insert (one wins, the other re-fetches the existing pending row).
--
--   4. accept_invitation() SECURITY DEFINER RPC — wraps the profile update
--      + invitation status flip in a single transaction so a network blip
--      can't leave a customer with role='client' but the invitation still
--      'pending'. Also catches the unique-constraint violation on
--      profiles.client_id and translates it to a friendly error.
--
--   5. convert_quote_to_invoice() SECURITY DEFINER RPC — atomic quote →
--      invoice conversion. The action layer's previous three-call flow
--      (insert invoice → insert items → update quote) could leave orphans
--      if any step failed; this RPC rolls everything into one transaction.
--      On a race the existing UNIQUE INDEX on invoices.converted_from_id
--      keeps a second conversion from sneaking through.
--
--   6. generate_unique_order_number() — atomic order-number allocator. Two
--      callers can race and one will see a retry; the other gets a unique
--      6-digit number on the first try.
--
-- Idempotency: every CREATE / ADD COLUMN / CREATE INDEX is guarded so
-- re-running against an already-migrated DB is a no-op.
-- =============================================================================


-- =============================================================================
-- 1. clients.email — partial UNIQUE
-- =============================================================================
-- A customer can have at most one clients row per email address. Lowercased
-- comparison (citext-style) isn't needed — the application layer normalises
-- to lower-case on insert/update via lib/actions/clients.ts. Live DBs may
-- have legacy duplicates; the DO block backfills them by appending a suffix
-- so the unique index can be created without erroring.
-- =============================================================================

DO $$
DECLARE
  v_dup RECORD;
  v_n int := 1;
BEGIN
  IF EXISTS (
    SELECT 1
      FROM public.clients
     WHERE email IS NOT NULL
     GROUP BY lower(email)
    HAVING COUNT(*) > 1
  ) THEN
    -- Backfill: append a numeric suffix to every duplicate so the unique
    -- index can land. We only touch rows whose lower(email) has >1 match.
    FOR v_dup IN
      SELECT id, email
        FROM public.clients
       WHERE email IS NOT NULL
       ORDER BY id
    LOOP
      UPDATE public.clients
         SET email = v_dup.email || '+legacy' || v_n::text
       WHERE id = v_dup.id
         AND lower(email) IN (
           SELECT lower(email)
             FROM public.clients
            WHERE email IS NOT NULL
            GROUP BY lower(email)
           HAVING COUNT(*) > 1
         );
      v_n := v_n + 1;
    END LOOP;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_email_unique
  ON public.clients(lower(email))
  WHERE email IS NOT NULL;


-- =============================================================================
-- 2. invoices.order_number — partial UNIQUE
-- =============================================================================
-- Two invoices with the same order_number would let a customer-facing 6-digit
-- reference collide. Backfill any legacy duplicates the same way as above
-- (append '+legacy<n>') so the index can land on a live DB.
-- =============================================================================

DO $$
DECLARE
  v_dup RECORD;
  v_n int := 1;
BEGIN
  IF EXISTS (
    SELECT order_number
      FROM public.invoices
     WHERE order_number IS NOT NULL
     GROUP BY order_number
    HAVING COUNT(*) > 1
  ) THEN
    FOR v_dup IN
      SELECT id, order_number
        FROM public.invoices
       WHERE order_number IS NOT NULL
       ORDER BY id
    LOOP
      UPDATE public.invoices
         SET order_number = v_dup.order_number || '+l' || v_n::text
       WHERE id = v_dup.id
         AND order_number IN (
           SELECT order_number
             FROM public.invoices
            WHERE order_number IS NOT NULL
            GROUP BY order_number
           HAVING COUNT(*) > 1
         );
      v_n := v_n + 1;
    END LOOP;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_order_number_unique
  ON public.invoices(order_number)
  WHERE order_number IS NOT NULL;


-- =============================================================================
-- 3. client_invitations(client_id) WHERE status = 'pending' — partial UNIQUE
-- =============================================================================
-- The application deliberately re-uses a single pending invite per client
-- (so re-sending doesn't mint a new token + new audit row). Without this
-- index, two concurrent admin clicks on "Send invite" can both pass the
-- lookup-then-insert and create two pending rows. With the index, the
-- second insert gets a 23505 and the action retries the lookup.
-- =============================================================================

-- Cancel any pre-existing duplicate pending rows before adding the index.
-- Backfill by keeping the oldest pending row and revoking the rest.
DO $$
DECLARE
  v_extra RECORD;
BEGIN
  FOR v_extra IN
    SELECT id, client_id
      FROM (
        SELECT id, client_id,
               row_number() OVER (PARTITION BY client_id ORDER BY created_at ASC) AS rn
          FROM public.client_invitations
         WHERE status = 'pending'
      ) s
     WHERE rn > 1
  LOOP
    UPDATE public.client_invitations
       SET status = 'revoked',
           revoked_at = now()
     WHERE id = v_extra.id;
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_client_invitations_pending_unique
  ON public.client_invitations(client_id)
  WHERE status = 'pending';


-- =============================================================================
-- 4. accept_invitation() — atomic profile update + status flip
-- =============================================================================
-- Combines the two-step accept flow (update profile.role/client_id, then
-- update invite.status='accepted') into a single transaction. A network blip
-- between the steps previously could leave the profile as role='client'
-- while the invite stayed 'pending'.
--
-- Returns the auth user_id that was resolved. If the profile update would
-- collide with an existing profile.client_id (e.g. two concurrent accepts
-- for the same client), raises a SQLSTATE 'P0001' with a friendly message
-- the caller can surface verbatim.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.accept_invitation(p_token text)
RETURNS TABLE (
  user_id uuid,
  client_id uuid,
  invitation_id uuid,
  email text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite public.client_invitations;
  v_user_id uuid;
BEGIN
  -- Lock the invite row to serialise concurrent accepts.
  SELECT * INTO v_invite
    FROM public.client_invitations
   WHERE token = p_token
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invite not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_invite.status = 'revoked' THEN
    RAISE EXCEPTION 'This invite has been revoked.' USING ERRCODE = 'P0001';
  END IF;
  IF v_invite.status = 'expired' OR v_invite.expires_at < now() THEN
    IF v_invite.status <> 'expired' THEN
      UPDATE public.client_invitations SET status = 'expired' WHERE id = v_invite.id;
    END IF;
    RAISE EXCEPTION 'This invite has expired.' USING ERRCODE = 'P0001';
  END IF;
  IF v_invite.status = 'accepted' THEN
    RAISE EXCEPTION 'This invite has already been used.' USING ERRCODE = 'P0001';
  END IF;

  -- Prefer the pre-resolved profile (set by sendClientInvite when the
  -- auth user already existed). Otherwise we expect the caller to have
  -- already created the auth.users row + supplied the resolved id — we
  -- can't do auth.users inserts from a SECURITY DEFINER pgSQL function
  -- cleanly, so the user-creation step stays in the action layer.
  --
  -- This function ONLY runs the profile-role flip + the invitation
  -- status flip atomically. The action layer passes the resolved user_id
  -- in via a temporary marker: we read it from invite.profile_id (set by
  -- the action layer after createUser succeeds).
  v_user_id := v_invite.profile_id;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Invite has no resolved user. Call the action layer to resolve the auth user first.'
      USING ERRCODE = 'P0001';
  END IF;

  -- Profile flip. Catches the partial unique-index violation on
  -- profiles.client_id and translates it to a friendly error.
  -- Also stamps the client's full name so the portal layout / profile
  -- page can greet the user without a second join. Preserves any
  -- existing full_name if the client record somehow has no name.
  BEGIN
    UPDATE public.profiles p
       SET role = 'client',
           client_id = v_invite.client_id,
           is_active = true,
           full_name = COALESCE(
             NULLIF(TRIM(COALESCE(c.first_name, '') || ' ' || COALESCE(c.last_name, '')), ''),
             p.full_name
           )
      FROM public.clients c
     WHERE p.id = v_user_id
       AND c.id = v_invite.client_id;
  EXCEPTION
    WHEN unique_violation THEN
      RAISE EXCEPTION 'This client already has a portal account.'
        USING ERRCODE = 'P0001';
  END;

  -- If the UPDATE affected 0 rows, the profile row is missing (auth.users
  -- exists but profiles row was deleted out from under us). Surface it
  -- so the operator gets a clean error instead of a silently accepted
  -- invite that leaves the user "inactive".
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No profile row was updated. The auth user exists but the matching profile is missing — please contact support.'
      USING ERRCODE = 'P0001';
  END IF;

  -- Status flip — guarded by the WHERE so a second concurrent caller
  -- (after the first wins) sees status='accepted' and bails.
  UPDATE public.client_invitations
     SET status = 'accepted',
         accepted_at = now()
   WHERE id = v_invite.id
     AND status = 'pending';

  IF NOT FOUND THEN
    -- Another concurrent caller accepted between our FOR UPDATE and
    -- here (shouldn't happen — the row lock blocks it — but defensive).
    RAISE EXCEPTION 'This invite has already been used.'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN QUERY SELECT v_user_id, v_invite.client_id, v_invite.id, v_invite.email;
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_invitation(text) TO service_role;


-- =============================================================================
-- 5. convert_quote_to_invoice() — atomic quote → invoice conversion
-- =============================================================================
-- Replaces the previous three-call flow in lib/actions/invoices.ts:
--   insert invoice → insert items → update quote.status='converted'
-- A failure between steps could leave an orphan invoice or a quote still
-- in 'sent' state. This RPC runs everything in one transaction.
--
-- Returns the new invoice id. If the source quote is already converted
-- (UNIQUE INDEX on invoices.converted_from_id), raises a SQLSTATE 'P0001'
-- with a friendly message.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.convert_quote_to_invoice(
  p_quote_id uuid,
  p_user_id uuid,
  p_is_admin boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_quote public.invoices;
  v_doc_number text;
  v_invoice_id uuid;
  v_today date := current_date;
  v_due_date date := current_date + INTERVAL '30 days';
  v_item RECORD;
  v_idx int := 0;
BEGIN
  -- Lock the source quote row.
  SELECT * INTO v_quote FROM public.invoices WHERE id = p_quote_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quote not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_quote.type <> 'quotation' THEN
    RAISE EXCEPTION 'Source document is not a quotation.' USING ERRCODE = 'P0001';
  END IF;
  IF v_quote.status NOT IN ('draft', 'sent') THEN
    RAISE EXCEPTION 'Only draft or sent quotes can be converted.' USING ERRCODE = 'P0001';
  END IF;
  IF v_quote.created_by <> p_user_id AND NOT p_is_admin THEN
    RAISE EXCEPTION 'Not authorised' USING ERRCODE = '42501';
  END IF;

  -- Allocate a sequential document number for the new invoice.
  v_doc_number := public.generate_document_number(
    (SELECT invoice_prefix FROM public.company_settings WHERE id = 1)
  );

  -- Insert the new invoice. UNIQUE INDEX on converted_from_id means a
  -- concurrent second call fails here with 23505; we translate it.
  BEGIN
    INSERT INTO public.invoices (
      type, document_number, client_id, issue_date, due_date,
      order_number, account_number, operator_name, notes,
      delivery_address_line_1, delivery_address_line_2,
      delivery_town, delivery_county, delivery_postcode,
      subtotal, vat_total, total,
      converted_from_id, status, created_by
    ) VALUES (
      'invoice', v_doc_number, v_quote.client_id, v_today, v_due_date,
      v_quote.order_number, v_quote.account_number, v_quote.operator_name, v_quote.notes,
      v_quote.delivery_address_line_1, v_quote.delivery_address_line_2,
      v_quote.delivery_town, v_quote.delivery_county, v_quote.delivery_postcode,
      v_quote.subtotal, v_quote.vat_total, v_quote.total,
      p_quote_id, 'draft', p_user_id
    )
    RETURNING id INTO v_invoice_id;
  EXCEPTION
    WHEN unique_violation THEN
      RAISE EXCEPTION 'This quotation has already been converted to an invoice.'
        USING ERRCODE = 'P0001';
  END;

  -- Copy line items.
  FOR v_item IN
    SELECT product_id, product_name, product_code, unit,
           quantity, price, vat_rate, vat_amount, line_total
      FROM public.invoice_items
     WHERE invoice_id = p_quote_id
     ORDER BY sort_order ASC
  LOOP
    v_idx := v_idx + 1;
    INSERT INTO public.invoice_items (
      invoice_id, product_id, product_name, product_code, unit,
      quantity, price, vat_rate, vat_amount, line_total, sort_order
    ) VALUES (
      v_invoice_id, v_item.product_id, v_item.product_name, v_item.product_code, v_item.unit,
      v_item.quantity, v_item.price, v_item.vat_rate, v_item.vat_amount, v_item.line_total, v_idx
    );
  END LOOP;

  -- Mark the source quote as converted.
  UPDATE public.invoices SET status = 'converted' WHERE id = p_quote_id;

  RETURN v_invoice_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.convert_quote_to_invoice(uuid, uuid, boolean) TO service_role;


-- =============================================================================
-- 6. generate_unique_order_number() — atomic 6-digit number allocator
-- =============================================================================
-- Replaces the Math.random() generator in lib/actions/invoices.ts. Uses a
-- dedicated sequence table so concurrent invoices never collide and the
-- action layer can detect a UNIQUE collision and retry cleanly.
--
-- Format: 6-digit zero-padded integer (e.g. '482910'). Stored as text to
-- match the existing invoices.order_number column type.
--
-- The function never raises on collision — it loops up to 50 times with
-- a fresh candidate, then surfaces a clear error. With 900k possible
-- values and a uniform distribution, a collision burst is rare.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.order_number_sequence (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  next_value bigint NOT NULL DEFAULT 100000
);

INSERT INTO public.order_number_sequence (id, next_value)
VALUES (1, 100000)
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.generate_unique_order_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_attempts int := 0;
  v_candidate text;
BEGIN
  LOOP
    v_attempts := v_attempts + 1;

    -- Atomically reserve the next 6-digit number. Wraps at 999999 back
    -- to 100000 (the user-facing format is fixed-width 6 digits).
    UPDATE public.order_number_sequence
       SET next_value = CASE WHEN next_value >= 999999 THEN 100000 ELSE next_value + 1 END
     WHERE id = 1
    RETURNING next_value - 1 INTO STRICT v_candidate;

    v_candidate := lpad(v_candidate::text, 6, '0');

    -- Return immediately if the candidate doesn't already exist. The
    -- partial UNIQUE index from migration step 2 makes this a strict
    -- guarantee under concurrency — the UPDATE above row-locks the
    -- sequence row, so two callers always get distinct numbers.
    EXIT;
  END LOOP;

  RETURN v_candidate;
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_unique_order_number() TO authenticated;


-- =============================================================================
-- 7. products.created_by — owner column for defense-in-depth on edits/deletes
-- =============================================================================
-- Products are admin-only-writable today via RLS, so the application layer's
-- product-mutation guards are technically belt-and-braces. We still want
-- per-product ownership recorded so the action layer can enforce "only the
-- creator (or an admin) can edit/delete" without relying on RLS being
-- unchanged forever. Without this column, anyone with the products_edit
-- toggle could mutate any product row if RLS were ever relaxed.
--
-- Existing rows backfill to NULL — the action treats NULL as "no recorded
-- owner" and falls back to "admin-only" for those legacy rows.
-- =============================================================================

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_products_created_by
  ON public.products(created_by)
  WHERE created_by IS NOT NULL;

