-- Atomic replacement of company phone/email channels.
--
-- The previous application logic deleted all existing rows and then inserted
-- the new set as two separate client calls. If the delete succeeded but the
-- insert failed, the company was left with zero contact channels.
--
-- This RPC wraps the delete + insert in a single transaction so the channel
-- list is always consistent. It is admin-only; the application layer also
-- checks admin rights, but the function enforces it independently so direct
-- API calls cannot bypass the gate.

CREATE OR REPLACE FUNCTION public.replace_company_contact_channels(
  p_settings_id integer,
  p_phones jsonb DEFAULT '[]'::jsonb,
  p_emails jsonb DEFAULT '[]'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Enforce admin-only access. The caller must be authenticated and an admin.
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  -- Lock the parent settings row to serialize concurrent replacements for the
  -- same company. This prevents two admins saving settings simultaneously from
  -- interleaving their delete/insert pairs.
  PERFORM id FROM public.company_settings WHERE id = p_settings_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Company settings not found.' USING ERRCODE = 'P0002';
  END IF;

  DELETE FROM public.company_phones WHERE settings_id = p_settings_id;

  INSERT INTO public.company_phones (
    settings_id,
    value,
    label,
    is_primary,
    show_header,
    show_homepage,
    show_contact_page,
    show_footer,
    show_invoice,
    show_email,
    show_auth,
    sort_order
  )
  SELECT
    p_settings_id,
    TRIM(v->>'value'),
    NULLIF(TRIM(v->>'label'), ''),
    COALESCE((v->>'is_primary')::boolean, false),
    COALESCE((v->>'show_header')::boolean, false),
    COALESCE((v->>'show_homepage')::boolean, false),
    COALESCE((v->>'show_contact_page')::boolean, false),
    COALESCE((v->>'show_footer')::boolean, false),
    COALESCE((v->>'show_invoice')::boolean, false),
    COALESCE((v->>'show_email')::boolean, false),
    COALESCE((v->>'show_auth')::boolean, false),
    COALESCE((v->>'sort_order')::smallint, 0)
  FROM jsonb_array_elements(p_phones) AS v
  WHERE NULLIF(TRIM(v->>'value'), '') IS NOT NULL;

  DELETE FROM public.company_emails WHERE settings_id = p_settings_id;

  INSERT INTO public.company_emails (
    settings_id,
    value,
    label,
    is_primary,
    show_header,
    show_homepage,
    show_contact_page,
    show_footer,
    show_invoice,
    show_email,
    show_auth,
    sort_order
  )
  SELECT
    p_settings_id,
    LOWER(TRIM(v->>'value')),
    NULLIF(TRIM(v->>'label'), ''),
    COALESCE((v->>'is_primary')::boolean, false),
    COALESCE((v->>'show_header')::boolean, false),
    COALESCE((v->>'show_homepage')::boolean, false),
    COALESCE((v->>'show_contact_page')::boolean, false),
    COALESCE((v->>'show_footer')::boolean, false),
    COALESCE((v->>'show_invoice')::boolean, false),
    COALESCE((v->>'show_email')::boolean, false),
    COALESCE((v->>'show_auth')::boolean, false),
    COALESCE((v->>'sort_order')::smallint, 0)
  FROM jsonb_array_elements(p_emails) AS v
  WHERE NULLIF(TRIM(v->>'value'), '') IS NOT NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.replace_company_contact_channels(integer, jsonb, jsonb)
  TO authenticated;

COMMENT ON FUNCTION public.replace_company_contact_channels(integer, jsonb, jsonb)
  IS 'Atomically replaces all company phone/email channels for a settings row (admin-only).';
