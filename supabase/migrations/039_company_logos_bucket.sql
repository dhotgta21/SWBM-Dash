-- Storage bucket for company logos
-- Public read so PDF renderers, email clients, and public invoice views can
-- fetch the image without an auth token. Writes are restricted to admins.

INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'logos',
  'logos',
  true,
  5242880, -- 5 MB
  ARRAY[
    'image/png',
    'image/jpeg',
    'image/gif',
    'image/webp',
    'image/svg+xml'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Public read access for logos (needed by react-pdf, email clients, public views)
DROP POLICY IF EXISTS "Public read access on logos" ON storage.objects;
CREATE POLICY "Public read access on logos"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'logos');

-- Admins can upload new logo files
DROP POLICY IF EXISTS "Admin insert on logos" ON storage.objects;
CREATE POLICY "Admin insert on logos"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'logos'
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  )
);

-- Admins can update/replace logo files
DROP POLICY IF EXISTS "Admin update on logos" ON storage.objects;
CREATE POLICY "Admin update on logos"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'logos'
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  )
)
WITH CHECK (bucket_id = 'logos');

-- Admins can delete old logo files
DROP POLICY IF EXISTS "Admin delete on logos" ON storage.objects;
CREATE POLICY "Admin delete on logos"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'logos'
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  )
);
