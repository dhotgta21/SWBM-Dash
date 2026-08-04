-- ─────────────────────────────────────────────────────────────────────────────
-- 138: Allow one row per STATUS per (load, invoice_item)
--
-- The picker and office load UIs both support loading PART of an order line
-- and marking the remainder out of stock. That state needs two rows for the
-- same (load_id, invoice_item_id): one 'loaded', one 'out_of_stock'.
-- UNIQUE (load_id, invoice_item_id) made every partial+OOS save fail with a
-- unique-constraint violation (save_pick_state RPC, createOfficeLoad insert,
-- updateOfficeLoad upsert).
--
-- Fix: scope the uniqueness to (load_id, invoice_item_id, status) so a line
-- may have at most one row per status. Stock reconciliation already sums only
-- status='loaded' rows, so accounting is unaffected.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.delivery_load_items
  DROP CONSTRAINT IF EXISTS delivery_load_items_load_id_invoice_item_id_key;

-- Defensive: if any duplicate (load_id, invoice_item_id, status) rows ever
-- existed (e.g. created out-of-band), merge them before adding the new key.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.delivery_load_items
    GROUP BY load_id, invoice_item_id, status
    HAVING count(*) > 1
    LIMIT 1
  ) THEN
    WITH ranked AS (
      SELECT id,
             row_number() OVER (
               PARTITION BY load_id, invoice_item_id, status
               ORDER BY created_at, id
             ) AS rn
      FROM public.delivery_load_items
    ), merged AS (
      SELECT load_id, invoice_item_id, status, sum(quantity) AS qty,
             -- Must match the DELETE's rn=1 ordering below (created_at, id);
             -- min(id) on UUIDs is unrelated and could sum onto a row that
             -- is then deleted.
             (array_agg(id ORDER BY created_at, id))[1] AS keep_id
      FROM public.delivery_load_items
      GROUP BY load_id, invoice_item_id, status
      HAVING count(*) > 1
    )
    UPDATE public.delivery_load_items d
    SET quantity = m.qty
    FROM merged m
    WHERE d.id = m.keep_id;

    DELETE FROM public.delivery_load_items d
    USING (
      SELECT id
      FROM (
        SELECT id,
               row_number() OVER (
                 PARTITION BY load_id, invoice_item_id, status
                 ORDER BY created_at, id
               ) AS rn
        FROM public.delivery_load_items
      ) r
      WHERE rn > 1
    ) dup
    WHERE d.id = dup.id;
  END IF;
END $$;

ALTER TABLE public.delivery_load_items
  DROP CONSTRAINT IF EXISTS delivery_load_items_load_item_status_key;

ALTER TABLE public.delivery_load_items
  ADD CONSTRAINT delivery_load_items_load_item_status_key
  UNIQUE (load_id, invoice_item_id, status);
