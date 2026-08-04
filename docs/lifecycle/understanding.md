# Understanding: SWBM bugfix campaign

## Product
SWBM is a builders merchant web app: public marketing (guides, blog, case studies, shop/quote), staff dashboard (invoices, clients), and integrations (GoAddress postcode lookup, PDF invoices).

## Confirmed issues and root causes

### 1. Footer
`SiteFooter` bottom bar is two-zone: copyright left; Privacy/Terms/Returns/merchant/Made by Humnod all in one right nav. User wants Made by Humnod centered between copyright and legal links. Same pattern should apply to `BlogFooter` / `ShopFooter` where present.

### 2. Guides detail load
Detail page mirrors blog/case studies but uniquely has `generateStaticParams` under `force-dynamic`. Production risk: `outputFileTracingIncludes` uses `'/*'` which may not cover `/guides/[slug]`. Content and slugs are valid. Fix: harden tracing globs, remove unnecessary `generateStaticParams`, align layout with blog, validate frontmatter arrays.

### 3. New invoice print/download
After create, modal HTML uses full `company`/`bankDetails`. PDF uses `POST /api/invoices/pdf` with `preview` payload. Zod `previewInvoiceSchema` only defines `invoice`, so `company`/`bankDetails` are stripped. Old invoices use `invoiceId` and reload company/bank from DB. Fix: prefer `invoiceId` when present; also load company/bank server-side in preview path as defense.

### 4. Address autocomplete
GoAddress success path checks `data.addresses` (not in API). Real field is `new_address_res` (already used for mapping). Guard always fails, falls through to postcodes.io (town/county only, no suggestions). Fix: check/map `new_address_res` (and `results` fallback).

## Approval
User asked to find root causes and fix. Understanding CONFIRMED by implement request.
