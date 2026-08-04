# TRACKING: SWBM bugfix campaign

## Intent
Fix four user-reported issues: footer Made by Humnod layout, guides detail load, new-invoice print/download parity, GoAddress autocomplete.

## Status (2026-08-04)
All four P0 features implemented; smoke verification done.

| ID | Feature | Root cause | Fix | Evidence |
|----|---------|------------|-----|----------|
| F-address | GoAddress | Guard checked non-existent `data.addresses` | Map `new_address_res` / `results` | vitest postcode.test.ts 3/3 pass |
| F-invoice-pdf | New invoice PDF | Preview Zod stripped company/bank | Prefer `invoiceId` after create; preview loads company/bank server-side | code review + path parity with InvoicePdf |
| F-footer | Made by Humnod | Cramped into right legal nav | 3-column bottom bar (left / center / right) | SiteFooter, BlogFooter, ShopFooter |
| F-guides | Guide detail | Fragile tracing glob + static params under force-dynamic | Explicit tracing includes; remove generateStaticParams; layout/loader harden | HTTP 200 on hub + 3 detail slugs |

## Commands
- `npx vitest run lib/actions/postcode.test.ts` → 3 passed
- `npx tsc --noEmit` → exit 0
- Dev smoke: `/guides`, `/guides/building-a-block-wall`, `/guides/laying-a-patio`, `/guides/mix-concrete` → 200 with body content

## Residual
- Production redeploy required for Vercel file-tracing change to take effect.
- Live GoAddress call still needs a valid stored token + ENCRYPTION_KEY; mapping bug was independent of the key.
