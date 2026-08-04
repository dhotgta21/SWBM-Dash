-- =============================================================================
-- 148 — product-images storage bucket
-- =============================================================================
-- Product images were written to /public/products at request time via
-- fs.writeFileSync (app/api/products/images/route.ts). On serverless hosts
-- (Vercel) the filesystem is read-only/ephemeral, so uploads failed or were
-- silently lost on the next deploy. Move them to Supabase Storage like
-- logos (039), appearance fonts (097) and team assets (063).
--
-- Public read: product images are shown on the public catalogue/quote pages.
-- Writes go through the API route with the service-role client, which
-- bypasses storage RLS; the route enforces products_add/products_edit
-- permissions itself.
-- =============================================================================

INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'product-images',
  'product-images',
  true,
  10485760, -- 10 MB
  ARRAY[
    'image/webp',
    'image/jpeg',
    'image/png',
    'image/gif'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Public read access (catalogue, quote pages, PDF/email renderers).
DROP POLICY IF EXISTS "Public read access on product-images" ON storage.objects;
CREATE POLICY "Public read access on product-images"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'product-images');
