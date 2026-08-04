-- =============================================================================
-- DEMO DATA: clients + multi-year invoices / line items / payments
-- =============================================================================
-- Run in Supabase → SQL Editor (after schema.sql + first admin via /register).
--
-- What it creates:
--   • ~50 trade clients (UK-style names / postcodes)
--   • ~2 years of invoices (hot / steady / quiet order patterns)
--   • 2–12 line items per document
--   • Payments that drive paid / partial statuses
--
-- Prerequisites:
--   1. schema.sql applied successfully
--   2. At least one profile with role = 'admin' (register first admin)
--   3. Optional: run 00_wipe_demo_clients_invoices.sql first to reseed cleanly
--
-- Tune volume: change v_client_count and v_months below.
-- Safe to re-run only after wipe (document numbers / account numbers must stay unique).
-- =============================================================================

DO $$
DECLARE
  v_admin           uuid;
  v_client_count    int := 50;   -- raise to 100 if your project is comfortable
  v_months          int := 24;   -- history window
  v_vat             numeric := 20;
  v_inv_prefix      text := 'INV';
  v_qte_prefix      text := 'QTE';
  v_month_letters   text := 'ABCDEFGHIJKL';
  v_i               int;
  v_j               int;
  v_n_docs          int;
  v_client_id       uuid;
  v_invoice_id      uuid;
  v_issue           date;
  v_due             date;
  v_type            text;
  v_status          text;
  v_insert_status   text;
  v_prefix          text;
  v_year            int;
  v_month0          int;
  v_letter          text;
  v_seq             int;
  v_doc_no          text;
  v_order_no        text;
  v_account         text;
  v_subtotal        numeric;
  v_vat_total       numeric;
  v_total           numeric;
  v_line_count      int;
  v_li              int;
  v_qty             numeric;
  v_price           numeric;
  v_line_net        numeric;
  v_line_vat        numeric;
  v_prod_id         uuid;
  v_prod_code       text;
  v_prod_name       text;
  v_prod_unit       text;
  v_pay_amount      numeric;
  v_tier            text;
  v_first           text;
  v_last            text;
  v_company         text;
  v_town            text;
  v_county          text;
  v_pc_prefix       text;
  v_delivery        text;
  v_terms           int;
  v_start           date := (date_trunc('month', CURRENT_DATE) - (make_interval(months => v_months)))::date;
  v_end             date := CURRENT_DATE;
  v_rng             float;
  v_product_count   int;
  -- running document sequence counters: key year*12+month0
  v_seq_map         jsonb := '{}'::jsonb;
  v_seq_key         text;
  v_order_seq       int := 100000;
  v_first_names     text[] := ARRAY[
    'James','Sarah','Michael','Emma','David','Olivia','Thomas','Sophie',
    'Daniel','Chloe','Andrew','Lucy','Chris','Hannah','Mark','Emily',
    'Paul','Grace','Ryan','Amelia','Ben','Laura','Jack','Katie'
  ];
  v_last_names      text[] := ARRAY[
    'Smith','Jones','Taylor','Brown','Wilson','Davies','Evans','Thomas',
    'Johnson','Roberts','Walker','Wright','Robinson','Thompson','White',
    'Hughes','Edwards','Green','Hall','Wood','Harris','Martin','Jackson'
  ];
  v_trades          text[] := ARRAY[
    'Builders','Construction','Developments','Building Services','Contractors',
    'Plumbing & Heating','Electrical','Roofing','Landscaping','Renovations',
    'Joinery','Groundworks','Windows & Doors','Tiling','Projects'
  ];
  v_towns           text[] := ARRAY[
    'Slough','Reading','High Wycombe','Maidenhead','Windsor','Bracknell',
    'Guildford','Woking','Oxford','Basingstoke','Staines','Uxbridge'
  ];
  v_counties        text[] := ARRAY[
    'Berkshire','Berkshire','Buckinghamshire','Berkshire','Berkshire','Berkshire',
    'Surrey','Surrey','Oxfordshire','Hampshire','Surrey','Greater London'
  ];
  v_postcodes       text[] := ARRAY[
    'SL1','RG1','HP11','SL6','SL4','RG12','GU1','GU21','OX1','RG21','TW18','UB8'
  ];
  v_streets         text[] := ARRAY[
    'High Street','Station Road','Church Lane','Park Avenue','London Road',
    'Mill Lane','Victoria Road','Industrial Estate','Trade Park','Builders Way'
  ];
  v_synth_names     text[] := ARRAY[
    'Building Sand (tonne)','Cement 25kg','Facing Brick','Dense Block 100mm',
    'CLS Timber 47x100','Plasterboard 12.5mm','Cavity Insulation 100mm',
    'Assorted Fixings Pack','Roofing Underlay','Trade Tool Kit'
  ];
  v_synth_codes     text[] := ARRAY[
    'DEMO-AGG-01','DEMO-CEM-01','DEMO-BRK-01','DEMO-BLK-01','DEMO-TIM-01',
    'DEMO-PB-01','DEMO-INS-01','DEMO-FIX-01','DEMO-ROF-01','DEMO-TOO-01'
  ];
  v_synth_units     text[] := ARRAY[
    'T','BAG','EA','EA','M','SH','PK','PK','RL','EA'
  ];
  v_synth_prices    numeric[] := ARRAY[
    42.50, 6.80, 0.85, 1.95, 4.20, 8.40, 28.00, 12.50, 48.00, 35.00
  ];
BEGIN
  -- Admin for created_by
  SELECT id INTO v_admin
    FROM public.profiles
   WHERE role = 'admin'
     AND COALESCE(is_active, true) = true
   ORDER BY created_at ASC NULLS LAST
   LIMIT 1;

  IF v_admin IS NULL THEN
    RAISE EXCEPTION
      'No admin profile found. Open /register on an empty database first, then re-run this seed.';
  END IF;

  SELECT COALESCE(invoice_prefix, 'INV'),
         COALESCE(quotation_prefix, 'QTE'),
         COALESCE(default_vat_rate, 20)
    INTO v_inv_prefix, v_qte_prefix, v_vat
    FROM public.company_settings
   WHERE id = 1;

  -- Demo branding (optional)
  UPDATE public.company_settings
     SET company_name = 'Demo Builder Merchant',
         updated_at = now()
   WHERE id = 1;

  SELECT COUNT(*)::int INTO v_product_count
    FROM public.products
   WHERE COALESCE(is_active, true) = true
     AND COALESCE(default_price, 0) > 0;

  RAISE NOTICE 'Seeding % clients over % months as admin % (priced products: %)',
    v_client_count, v_months, v_admin, v_product_count;

  FOR v_i IN 1..v_client_count LOOP
    -- Tier split: 20% hot, 50% steady, 30% quiet
    IF v_i <= (v_client_count * 0.20)::int THEN
      v_tier := 'hot';
      v_n_docs := GREATEST(8, (v_months * 1.2)::int);  -- ~weekly-ish
    ELSIF v_i <= (v_client_count * 0.70)::int THEN
      v_tier := 'steady';
      v_n_docs := GREATEST(4, (v_months * 0.55)::int); -- ~fortnightly
    ELSE
      v_tier := 'quiet';
      v_n_docs := GREATEST(2, (v_months * 0.25)::int); -- monthly-ish
    END IF;

    v_first := v_first_names[1 + ((v_i - 1) % array_length(v_first_names, 1))];
    v_last := v_last_names[1 + ((v_i * 3) % array_length(v_last_names, 1))];
    v_company := v_last || ' ' || v_trades[1 + ((v_i * 5) % array_length(v_trades, 1))];
    v_town := v_towns[1 + ((v_i - 1) % array_length(v_towns, 1))];
    v_county := v_counties[1 + ((v_i - 1) % array_length(v_counties, 1))];
    v_pc_prefix := v_postcodes[1 + ((v_i - 1) % array_length(v_postcodes, 1))];
    v_account := lpad((1000000 + v_i)::text, 7, '0');
    v_terms := CASE WHEN v_tier = 'hot' THEN 30 WHEN v_tier = 'steady' THEN 30 ELSE 14 END;
    v_client_id := gen_random_uuid();

    INSERT INTO public.clients (
      id, first_name, last_name, email, phone, company_name, account_number,
      address_line_1, town, county, postcode, notes,
      payment_terms_days, credit_limit, created_by, reviewed, ai_created
    ) VALUES (
      v_client_id,
      v_first,
      v_last,
      lower(v_first || '.' || v_last || '.' || v_i || '@demo-trade.example'),
      '07' || lpad((100000000 + v_i * 137)::text, 9, '0'),
      v_company,
      v_account,
      (10 + (v_i % 120))::text || ' ' || v_streets[1 + ((v_i * 2) % array_length(v_streets, 1))],
      v_town,
      v_county,
      v_pc_prefix || ' ' || (1 + (v_i % 9))::text || chr(65 + (v_i % 26)) || chr(65 + ((v_i * 3) % 26)),
      'Demo ' || v_tier || ' trade account',
      v_terms,
      CASE v_tier WHEN 'hot' THEN 25000 WHEN 'steady' THEN 10000 ELSE 5000 END,
      v_admin,
      true,
      false
    );

    FOR v_j IN 1..v_n_docs LOOP
      -- Spread issue dates across the window
      v_issue := (v_start + ((v_j - 1) * GREATEST(1, (v_months * 30 / v_n_docs)))::int
                  + ((v_i + v_j) % 5))::date;
      IF v_issue > v_end THEN
        v_issue := v_end - ((v_j % 20))::int;
      END IF;
      -- Prefer weekday
      WHILE EXTRACT(DOW FROM v_issue) IN (0, 6) LOOP
        v_issue := v_issue + 1;
      END LOOP;
      IF v_issue > v_end THEN
        v_issue := v_end;
      END IF;

      v_rng := ((v_i * 17 + v_j * 31) % 100) / 100.0;
      IF v_rng < 0.10 THEN
        v_type := 'quotation';
        v_prefix := v_qte_prefix;
        IF v_rng < 0.04 THEN
          v_status := 'draft';
        ELSIF v_rng < 0.07 THEN
          v_status := 'sent';
        ELSE
          v_status := 'converted';
        END IF;
      ELSE
        v_type := 'invoice';
        v_prefix := v_inv_prefix;
        IF v_rng < 0.18 THEN
          v_status := 'draft';
        ELSIF v_rng < 0.28 THEN
          v_status := 'sent';
        ELSIF v_rng < 0.40 THEN
          v_status := 'partial';
        ELSE
          v_status := 'paid';
        END IF;
        -- Older invoices more often paid
        IF (v_end - v_issue) > 60 AND v_status = 'sent' AND (v_i + v_j) % 3 = 0 THEN
          v_status := 'paid';
        END IF;
      END IF;

      v_year := EXTRACT(YEAR FROM v_issue)::int;
      v_month0 := EXTRACT(MONTH FROM v_issue)::int - 1;
      v_letter := substr(v_month_letters, v_month0 + 1, 1);
      v_seq_key := v_prefix || '|' || v_year::text || '|' || v_month0::text;
      v_seq := COALESCE((v_seq_map ->> v_seq_key)::int, 0) + 1;
      v_seq_map := jsonb_set(v_seq_map, ARRAY[v_seq_key], to_jsonb(v_seq), true);
      v_doc_no := v_prefix || '-' || v_year::text || '-' || v_letter || v_seq::text;
      v_order_seq := v_order_seq + 1;
      v_order_no := v_order_seq::text;
      v_due := v_issue + v_terms;
      v_delivery := CASE WHEN (v_i + v_j) % 4 = 0 THEN 'collection' ELSE 'delivery' END;
      v_invoice_id := gen_random_uuid();

      -- Build lines first into temps, then totals
      v_line_count := 2 + ((v_i + v_j * 3) % 11); -- 2..12
      v_subtotal := 0;
      v_vat_total := 0;

      -- Insert invoice with placeholder totals; update after lines
      -- paid/partial start as 'sent' so payments can flip them
      v_insert_status := CASE
        WHEN v_status IN ('paid', 'partial') THEN 'sent'
        ELSE v_status
      END;

      INSERT INTO public.invoices (
        id, type, document_number, order_number, account_number, client_id,
        status, issue_date, due_date, expiry_date, operator_name,
        delivery_method,
        delivery_address_line_1, delivery_town, delivery_county, delivery_postcode,
        subtotal, vat_total, total, amount_paid, created_by, your_reference, notes
      ) VALUES (
        v_invoice_id,
        v_type,
        v_doc_no,
        v_order_no,
        v_account,
        v_client_id,
        v_insert_status,
        v_issue,
        CASE WHEN v_type = 'invoice' THEN v_due ELSE NULL END,
        CASE WHEN v_type = 'quotation' THEN v_issue + 30 ELSE NULL END,
        'Demo Operator',
        v_delivery,
        CASE WHEN v_delivery = 'delivery' THEN (10 + (v_i % 50))::text || ' Site Road' ELSE NULL END,
        CASE WHEN v_delivery = 'delivery' THEN v_town ELSE NULL END,
        CASE WHEN v_delivery = 'delivery' THEN v_county ELSE NULL END,
        CASE WHEN v_delivery = 'delivery' THEN v_pc_prefix || ' 1AA' ELSE NULL END,
        0, 0, 0, 0,
        v_admin,
        'PO-' || (1000 + v_i * 10 + v_j)::text,
        CASE WHEN v_tier = 'hot' THEN 'Priority trade account' ELSE NULL END
      );

      FOR v_li IN 0..(v_line_count - 1) LOOP
        IF v_product_count > 0 THEN
          SELECT p.id, p.code, p.name, COALESCE(p.unit, 'EA'),
                 GREATEST(0.5, COALESCE(p.default_price, 10)
                   * (0.92 + ((v_i + v_j + v_li) % 9) * 0.02))
            INTO v_prod_id, v_prod_code, v_prod_name, v_prod_unit, v_price
            FROM public.products p
           WHERE COALESCE(p.is_active, true) = true
             AND COALESCE(p.default_price, 0) > 0
           ORDER BY md5(p.id::text || v_i::text || v_j::text || v_li::text)
           LIMIT 1;
        ELSE
          v_prod_id := NULL;
          v_prod_code := v_synth_codes[1 + (v_li % array_length(v_synth_codes, 1))];
          v_prod_name := v_synth_names[1 + (v_li % array_length(v_synth_names, 1))];
          v_prod_unit := v_synth_units[1 + (v_li % array_length(v_synth_units, 1))];
          v_price := v_synth_prices[1 + (v_li % array_length(v_synth_prices, 1))];
        END IF;

        v_qty := CASE
          WHEN v_prod_unit IN ('T', 'M') THEN round((0.5 + ((v_i + v_li) % 10) * 0.7)::numeric, 2)
          ELSE (1 + ((v_i + v_j + v_li) % 24))::numeric
        END;
        v_price := round(v_price::numeric, 2);
        v_line_net := round(v_qty * v_price, 2);
        v_line_vat := round(v_line_net * (v_vat / 100.0), 2);
        v_subtotal := v_subtotal + v_line_net;
        v_vat_total := v_vat_total + v_line_vat;

        INSERT INTO public.invoice_items (
          id, invoice_id, product_id, product_name, product_code, unit,
          quantity, price, vat_rate, vat_amount, line_total, sort_order
        ) VALUES (
          gen_random_uuid(),
          v_invoice_id,
          v_prod_id,
          v_prod_name,
          v_prod_code,
          v_prod_unit,
          v_qty,
          v_price,
          v_vat,
          v_line_vat,
          v_line_net + v_line_vat,
          v_li
        );
      END LOOP;

      v_subtotal := round(v_subtotal, 2);
      v_vat_total := round(v_vat_total, 2);
      v_total := round(v_subtotal + v_vat_total, 2);

      UPDATE public.invoices
         SET subtotal = v_subtotal,
             vat_total = v_vat_total,
             total = v_total
       WHERE id = v_invoice_id;

      -- Payments (trigger sets paid/partial)
      IF v_type = 'invoice' AND v_status IN ('paid', 'partial') AND v_total > 0 THEN
        v_pay_amount := CASE
          WHEN v_status = 'paid' THEN v_total
          ELSE round(v_total * (0.30 + ((v_i + v_j) % 5) * 0.10), 2)
        END;
        IF v_pay_amount > 0 THEN
          INSERT INTO public.payments (
            id, invoice_id, amount, payment_date, method, reference, created_by
          ) VALUES (
            gen_random_uuid(),
            v_invoice_id,
            LEAST(v_pay_amount, v_total),
            LEAST(v_end, v_issue + 3 + ((v_i + v_j) % 14)),
            (ARRAY['bank_transfer','card','cash','cheque','ecod'])[1 + ((v_i + v_j) % 5)],
            'PAY-' || v_doc_no,
            v_admin
          );
        END IF;
      END IF;
    END LOOP;
  END LOOP;

  -- Sync document sequences for future live docs (prefix, year, month 1-12)
  FOR v_seq_key, v_seq IN
    SELECT key, value::int FROM jsonb_each_text(v_seq_map)
  LOOP
    -- key format: PREFIX|year|month0
    INSERT INTO public.document_sequences (prefix, year, month, current_number)
    VALUES (
      split_part(v_seq_key, '|', 1),
      split_part(v_seq_key, '|', 2)::int,
      split_part(v_seq_key, '|', 3)::int + 1,
      v_seq
    )
    ON CONFLICT (prefix, year, month)
    DO UPDATE SET current_number = GREATEST(
      public.document_sequences.current_number,
      EXCLUDED.current_number
    );
  END LOOP;

  -- Bump order number sequence if table exists
  BEGIN
    UPDATE public.order_number_sequence
       SET next_value = GREATEST(next_value, v_order_seq + 1)
     WHERE id = 1;
  EXCEPTION WHEN undefined_table THEN
    NULL;
  END;

  RAISE NOTICE 'Demo seed finished.';
END $$;

-- Summary
SELECT
  (SELECT COUNT(*) FROM public.clients) AS clients,
  (SELECT COUNT(*) FROM public.invoices WHERE type = 'invoice') AS invoices,
  (SELECT COUNT(*) FROM public.invoices WHERE type = 'quotation') AS quotations,
  (SELECT COUNT(*) FROM public.invoice_items) AS line_items,
  (SELECT COUNT(*) FROM public.payments) AS payments,
  (SELECT MIN(issue_date)::text FROM public.invoices) AS min_issue_date,
  (SELECT MAX(issue_date)::text FROM public.invoices) AS max_issue_date;

SELECT status, COUNT(*) AS n
  FROM public.invoices
 GROUP BY status
 ORDER BY n DESC;
