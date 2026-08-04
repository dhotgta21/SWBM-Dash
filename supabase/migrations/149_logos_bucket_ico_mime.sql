-- =============================================================================
-- 149 — Allow favicon.ico in the logos bucket
-- =============================================================================
-- The brand-asset proxy (app/api/brand-assets/[name]) serves custom logo
-- variants from the logos bucket, including favicon.ico. The bucket's
-- allowed_mime_types (migration 039) did not include an ICO type, so the
-- upload would be rejected.
-- =============================================================================

UPDATE storage.buckets
   SET allowed_mime_types = ARRAY[
         'image/png',
         'image/jpeg',
         'image/gif',
         'image/webp',
         'image/svg+xml',
         'image/x-icon',
         'image/vnd.microsoft.icon'
       ]
 WHERE id = 'logos';
