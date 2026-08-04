-- Migration 043: add description and image_url to products
-- The public catalogue now shows a short product description and an image
-- on category pages and individual product detail pages.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS image_url text;
