// lib/brand.ts
// Single source of truth for brand-asset dimensions.
//
// Anything that renders the brand mark (BrandLogo, DashboardBrand, OG image,
// PDF header, email header, etc.) imports from here so when the underlying
// Logo.png / Logo.webp is re-cropped, only one constant needs to change.
//
// The mark lives in public/Logo.png + public/Logo.webp. Both files are kept
// in sync; the PNG carries the alpha channel for non-white backgrounds and
// the WebP is the size-optimised version used on the marketing site.

/** Composite canvas aspect (width / height) of public/Logo.{png,webp}.
 *  Re-measure with `py -c "from PIL import Image; print(Image.open('public/Logo.webp').size)"`
 *  whenever the mark is re-cropped. */
export const BRAND_LOGO_ASPECT = 1

/** Pixel dimensions of the underlying source asset — used as the Next.js
 *  `<Image width height>` reservation so we don't pull the full-size image
 *  out of cache for a small UI render. */
export const BRAND_LOGO_INTRINSIC_WIDTH = 512
export const BRAND_LOGO_INTRINSIC_HEIGHT = 512
