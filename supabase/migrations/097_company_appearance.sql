-- Appearance / UI customisation columns
-- Stores logo text options, custom fonts, and colour skin overrides.

ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS logo_text_enabled boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS logo_text_primary text DEFAULT null,
  ADD COLUMN IF NOT EXISTS logo_text_secondary text DEFAULT null,
  ADD COLUMN IF NOT EXISTS logo_text_layout text DEFAULT 'stacked',
  ADD COLUMN IF NOT EXISTS primary_font_url text DEFAULT null,
  ADD COLUMN IF NOT EXISTS primary_font_family text DEFAULT null,
  ADD COLUMN IF NOT EXISTS secondary_font_url text DEFAULT null,
  ADD COLUMN IF NOT EXISTS secondary_font_family text DEFAULT null,
  ADD COLUMN IF NOT EXISTS theme_primary_color text DEFAULT '#b91c1c',
  ADD COLUMN IF NOT EXISTS theme_primary_foreground_color text DEFAULT '#ffffff',
  ADD COLUMN IF NOT EXISTS theme_secondary_color text DEFAULT '#f1f5f9',
  ADD COLUMN IF NOT EXISTS theme_secondary_foreground_color text DEFAULT '#0f172a',
  ADD COLUMN IF NOT EXISTS theme_background_color text DEFAULT '#f8f9fb',
  ADD COLUMN IF NOT EXISTS theme_foreground_color text DEFAULT '#0f172a',
  ADD COLUMN IF NOT EXISTS theme_card_color text DEFAULT '#ffffff',
  ADD COLUMN IF NOT EXISTS theme_muted_color text DEFAULT '#f1f5f9',
  ADD COLUMN IF NOT EXISTS theme_border_color text DEFAULT '#e2e8f0',
  ADD COLUMN IF NOT EXISTS theme_success_color text DEFAULT '#16a34a',
  ADD COLUMN IF NOT EXISTS theme_warning_color text DEFAULT '#d97706',
  ADD COLUMN IF NOT EXISTS theme_destructive_color text DEFAULT '#dc2626';

-- Storage bucket for uploaded font files
-- Public read so browsers can load @font-face URLs. Writes are done via
-- server actions (service role), but we also allow admins directly.

INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'appearance',
  'appearance',
  true,
  5242880, -- 5 MB
  ARRAY[
    'font/ttf',
    'font/otf',
    'font/woff',
    'font/woff2'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Public read access for font files (needed by browsers for @font-face)
DROP POLICY IF EXISTS "Public read access on appearance fonts" ON storage.objects;
CREATE POLICY "Public read access on appearance fonts"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'appearance');

-- Admins can upload font files
DROP POLICY IF EXISTS "Admin insert on appearance fonts" ON storage.objects;
CREATE POLICY "Admin insert on appearance fonts"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'appearance'
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  )
);

-- Admins can update/replace font files
DROP POLICY IF EXISTS "Admin update on appearance fonts" ON storage.objects;
CREATE POLICY "Admin update on appearance fonts"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'appearance'
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  )
)
WITH CHECK (bucket_id = 'appearance');

-- Admins can delete old font files
DROP POLICY IF EXISTS "Admin delete on appearance fonts" ON storage.objects;
CREATE POLICY "Admin delete on appearance fonts"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'appearance'
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  )
);
