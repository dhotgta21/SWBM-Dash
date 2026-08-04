# Requirements: SWBM bugfix campaign (2026-08-04)

## Intent
User-reported production issues on the existing Star Hawk Builders Merchant (SWBM) Next.js site. No new product; repair four concrete defects.

## Goals
1. Footer bottom bar: copyright left, Made by Humnod centered, legal/merchant links right.
2. Guides: clicking any guide from `/guides` must load the detail page reliably.
3. New invoice modal: Print / Download / PDF Preview must match the on-screen invoice (same as old invoices via `invoiceId`).
4. Invoice/client address autocomplete: GoAddress must return address suggestions when token is valid (no silent empty postcodes.io fallback).

## Non-goals
- Redesign of footer beyond bottom-bar layout.
- New address providers.
- Invoice template redesign.
- Deploy / key rotation (user already rotated GoAddress key).

## Success criteria
- Footer layout matches three-zone layout on sm+ screens.
- `/guides/{slug}` returns 200 with guide content for all 12 published guides.
- After create, PDF actions use saved `invoiceId` (or server-loaded company/bank) so company + bank match HTML preview.
- GoAddress successful responses yield non-empty suggestions dropdown.

## Platforms
Web (Next.js App Router, Supabase, Vercel-style deploy).
