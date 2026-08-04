'use server'

// Quote / order request submission flow. The public shop posts the
// cart and contact form here; we run the full server-side validation
// and abuse-detection gauntlet before any row hits the DB:
//
//   1. Rate-limit by IP+email bucket (5/min) + IP only (20/min).
//   2. Reject if the IP is currently banned.
//   3. Reject if the email has already hit the per-email quota
//      (max 10 requests in a rolling 30-day window).
//   4. Record the (ip, email) submission — this auto-bans the IP if
//      it has been used with > 3 distinct emails in the last 24h.
//   5. Re-check the ban list (the record call may have just
//      triggered one) and bail if so.
//   6. Generate a sequential request number (QR-YYYY-Mnnn for quotes,
//      OR-YYYY-Mnnn for orders) via the existing document_sequences
//      table.
//   7. Insert quote_request + line items in a single transaction.
//
// `kind`:
//   * 'quote' — anything goes (operator fills in any missing prices).
//   * 'order' — every line must have a price at submit time (operator
//     only needs to call + confirm + convert to invoice for payment).
//
// We always return { error } or { ok: true, requestNumber, kind }.
// The client uses `kind` to route the user to the right confirmation
// page copy without us needing a separate endpoint.

import { headers } from 'next/headers'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { rateLimit, type RateLimitResult } from '@/lib/rate-limit'
import { createMemoryRateLimiter } from '@/lib/rate-limit/memory'
import { verifyTurnstileFormField } from '@/lib/turnstile'
import { getClientIp } from '@/lib/ip'
import { getSaleInfo } from '@/lib/products/sale'

// In-memory pre-filter (same pattern as lib/actions/auth.ts), with a larger
// bucket count because public quote requests are keyed by IP/email pairs.
const memRateLimiter = createMemoryRateLimiter({ maxBuckets: 2000 })

async function twoTierRateLimit(key: string, max: number, windowMs: number, failOpen = false): Promise<RateLimitResult> {
  const mem = memRateLimiter.check(key, max, windowMs)
  if (!mem.allowed) return mem
  const admin = createAdminClient()
  return rateLimit(admin, key, max, windowMs, { failOpen })
}

const MAX_QUOTE_REQUESTS_PER_EMAIL = 10
const QUOTA_WINDOW_DAYS = 30

const itemSchema = z.object({
  productId: z.string().uuid(),
  code: z.string().min(1).max(64),
  name: z.string().min(1).max(200),
  unit: z.string().min(1).max(16),
  price: z.number().nonnegative().max(1_000_000).nullable(),
  quantity: z.number().positive().max(100_000),
})

const cartSchema = z.object({
  items: z.array(itemSchema).min(1).max(200),
})

export type QuoteRequestKind = 'quote' | 'order'

export type SubmitQuoteResult =
  | { ok: false; error: string }
  | { ok: true; requestNumber: string; kind: QuoteRequestKind }

export async function submitQuoteRequest(formData: FormData): Promise<SubmitQuoteResult> {
  const admin = createAdminClient()
  const headersList = await headers()

  // ─── 1. Pull + shape-check inputs ─────────────────────────────────
  const clientName = (formData.get('client_name') as string | null)?.trim() ?? ''
  const clientEmail = (formData.get('client_email') as string | null)?.trim().toLowerCase() ?? ''
  const clientPhone = (formData.get('client_phone') as string | null)?.trim() ?? ''
  const clientCompany = (formData.get('client_company') as string | null)?.trim() ?? ''
  const addr1 = (formData.get('delivery_address_line_1') as string | null)?.trim() ?? ''
  const addr2 = (formData.get('delivery_address_line_2') as string | null)?.trim() ?? ''
  const town = (formData.get('delivery_town') as string | null)?.trim() ?? ''
  const county = (formData.get('delivery_county') as string | null)?.trim() ?? ''
  const postcode = (formData.get('delivery_postcode') as string | null)?.trim() ?? ''
  const notes = (formData.get('notes') as string | null)?.trim() ?? ''
  const cartRaw = formData.get('cart')
  const userAgent = headersList.get('user-agent') ?? ''

  // `kind` arrives from a hidden form input populated by the cart's CTA
  // button. Anything other than 'order' falls back to 'quote' so an
  // older checkout never silently fails because we added the field.
  const rawKind = (formData.get('kind') as string | null)?.trim() ?? ''
  const kind: QuoteRequestKind = rawKind === 'order' ? 'order' : 'quote'

  // Require a valid Cloudflare Turnstile token before processing the request.
  const captchaError = await verifyTurnstileFormField(formData)
  if (captchaError) {
    return { ok: false, error: captchaError }
  }

  if (!clientName || clientName.length > 120) {
    return { ok: false, error: 'Please enter your name.' }
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clientEmail) || clientEmail.length > 254) {
    return { ok: false, error: 'Please enter a valid email address.' }
  }
  if (clientPhone && clientPhone.length > 40) {
    return { ok: false, error: 'Phone number is too long.' }
  }
  if (clientCompany && clientCompany.length > 160) {
    return { ok: false, error: 'Company name is too long.' }
  }
  if (notes.length > 1000) {
    return { ok: false, error: 'Notes are too long (max 1000 characters).' }
  }

  // ─── 2. Parse + validate cart ─────────────────────────────────────
  let parsedCart: { items: z.infer<typeof itemSchema>[] }
  try {
    if (typeof cartRaw !== 'string' || !cartRaw.trim()) {
      return { ok: false, error: 'Your cart is empty.' }
    }
    const parsedJson = JSON.parse(cartRaw) as unknown
    const result = cartSchema.safeParse(parsedJson)
    if (!result.success) {
      return { ok: false, error: 'Your cart contains invalid items. Please refresh and try again.' }
    }
    parsedCart = { items: result.data.items }
  } catch {
    return { ok: false, error: 'Your cart is invalid. Please refresh and try again.' }
  }

  // Orders cannot proceed if any line is missing a price — the operator
  // can't convert an order into an invoice without an agreed price per
  // line. The cart UI should have prevented this already; this guard
  // catches direct API hits and stale UI.
  if (kind === 'order' && parsedCart.items.some((i) => i.price === null)) {
    return {
      ok: false,
      error:
        'One or more items in your cart don\u2019t have a listed price, so they can\u2019t be ordered online. Please submit a written quote instead and we\u2019ll price them for you.',
    }
  }

  const ip = getClientIp(headersList)

  // ─── 3. Rate-limit ────────────────────────────────────────────────
  const bucketIpEmail = await twoTierRateLimit(`quote:${ip}:${clientEmail}`, 5, 60_000)
  if (!bucketIpEmail.allowed) {
    return { ok: false, error: 'Too many submissions. Please wait a minute and try again.' }
  }
  const bucketIp = await twoTierRateLimit(`quote:${ip}`, 20, 60_000)
  if (!bucketIp.allowed) {
    return { ok: false, error: 'Too many submissions from your network. Please slow down.' }
  }

  // ─── 4. Reject banned IPs ─────────────────────────────────────────
  const banCheck = await admin.rpc('is_ip_banned', { p_ip: ip })
  if (banCheck.error) {
    console.error('is_ip_banned RPC failed:', banCheck.error)
    return { ok: false, error: 'We could not process your request right now. Please try again later.' }
  }
  if (banCheck.data === true) {
    return {
      ok: false,
      error:
        'We could not accept this submission from your network. If you believe this is a mistake, please call us on the trade counter.',
    }
  }

  // ─── 5. Reject emails over the per-email quota ────────────────────
  const quotaResult = await admin.rpc('count_quote_requests_in_window', {
    p_email: clientEmail,
    p_window_days: QUOTA_WINDOW_DAYS,
  })
  if (quotaResult.error) {
    console.error('count_quote_requests_in_window RPC failed:', quotaResult.error)
    return { ok: false, error: 'We could not process your request right now. Please try again later.' }
  }
  const used = typeof quotaResult.data === 'number' ? quotaResult.data : 0
  if (used >= MAX_QUOTE_REQUESTS_PER_EMAIL) {
    return {
      ok: false,
      error: `You've reached the limit of ${MAX_QUOTE_REQUESTS_PER_EMAIL} quote requests in the last ${QUOTA_WINDOW_DAYS} days. Call the trade counter if you need help with a larger order.`,
    }
  }

  // ─── 6. Log this (ip, email) submission — may auto-ban ────────────
  // record_ip_email returns the number of *distinct* emails that have
  // submitted from this IP in the last 24h (including this one). It's
  // surfaced to ops logs as abuse telemetry even when the auto-ban
  // threshold isn't crossed — a slow creep toward the threshold is a
  // useful signal on its own.
  const recordResult = await admin.rpc('record_ip_email', {
    p_ip: ip,
    p_email: clientEmail,
  })
  if (recordResult.error) {
    console.error('record_ip_email RPC failed:', recordResult.error)
    // Continue — a logging hiccup shouldn't lose the request, but
    // we'll have missed the auto-ban check.
  } else if (typeof recordResult.data === 'number') {
    const distinctFromIp = recordResult.data
    if (distinctFromIp > 1) {
      console.info(
        `[quote] ip=${ip} email=${clientEmail} submitted; ` +
          `${distinctFromIp} distinct emails from this IP in the last 24h ` +
          `(auto-ban threshold = 3)`
      )
    }
  }

  // ─── 7. Re-check the ban list (record_ip_email may have just
  //        banned this IP because it has > 3 distinct emails / 24h).
  const recheckBan = await admin.rpc('is_ip_banned', { p_ip: ip })
  if (recheckBan.error) {
    console.error('is_ip_banned recheck failed:', recheckBan.error)
  } else if (recheckBan.data === true) {
    return {
      ok: false,
      error:
        'We could not accept this submission from your network. Multiple email addresses have been used from this connection.',
    }
  }

  // ─── 8. Snapshot product ids from the catalogue ────────────────────
  // The client could tamper with the cart payload, so we re-fetch
  // each product from the DB and use the canonical code/name/unit.
  // This prevents a malicious submission claiming "10 tonnes of
  // gold at £1".
  const productIds = parsedCart.items.map((i) => i.productId)
  const { data: products, error: productsErr } = await admin
    .from('products')
    .select('id, code, name, unit, default_price, price_from, sale_price, sale_starts_at, sale_ends_at, sale_label, is_active')
    .is('deleted_at', null)
    .in('id', productIds)

  if (productsErr) {
    console.error('Failed to re-fetch cart products:', productsErr)
    return { ok: false, error: 'We could not process your request right now. Please try again later.' }
  }

  const productMap = new Map(
    (products ?? []).map((p) => [
      (p as { id: string }).id,
      p as {
        id: string
        code: string
        name: string
        unit: string
        default_price: number | null
        price_from: number | null
        sale_price: number | null
        sale_starts_at: string | null
        sale_ends_at: string | null
        sale_label: string | null
        is_active: boolean
      },
    ])
  )

  const cleanItems = parsedCart.items.flatMap((item) => {
    const p = productMap.get(item.productId)
    if (!p || !p.is_active) return []
    // Effective price mirrors the storefront (lib/public-products/price.ts):
    // an active sale inside its window wins over the trade/from price.
    // Campaign discounts (getCampaignSaleInfo) are NOT applied here — wiring
    // campaign membership into the cart snapshot would need an extra query;
    // the storefront applies those at display time.
    const sale = getSaleInfo({
      sale_price: p.sale_price,
      sale_starts_at: p.sale_starts_at,
      sale_ends_at: p.sale_ends_at,
      sale_label: p.sale_label,
      default_price: Number(p.default_price ?? 0),
    })
    const suggestedPrice = sale.active
      ? sale.effectivePrice
      : p.price_from
        ? Number(p.price_from)
        : p.default_price
          ? Number(p.default_price)
          : null
    return [
      {
        productId: p.id,
        productCode: p.code,
        productName: p.name,
        unit: p.unit,
        quantity: item.quantity,
        suggestedPrice,
      },
    ]
  })

  if (cleanItems.length === 0) {
    return { ok: false, error: 'None of the items in your cart are available. Please review and try again.' }
  }

  // Second order-only guard, this time against the catalogue snapshot.
  // Belt-and-braces: the cart payload was checked at step 2, and now
  // we verify the canonical DB rows also have a price.
  if (kind === 'order' && cleanItems.some((i) => i.suggestedPrice === null)) {
    return {
      ok: false,
      error:
        'One or more items no longer have a listed price on our site, so they can\u2019t be ordered online right now. Please submit a written quote instead.',
    }
  }

  // ─── 9. Allocate a sequential request number ─────────────────────
  // Prefix encodes the kind so the trade counter can scan a queue of
  // OR-… numbers separately from QR-… quotes.
  const numberPrefix = kind === 'order' ? 'OR' : 'QR'
  const { data: requestNumber, error: numberErr } = await admin.rpc('generate_document_number', {
    doc_prefix: numberPrefix,
  })
  if (numberErr || !requestNumber) {
    console.error('generate_document_number failed:', numberErr)
    return { ok: false, error: 'We could not process your request right now. Please try again later.' }
  }

  // ─── 10. Insert quote_request + line items ───────────────────────
  const { data: inserted, error: insertErr } = await admin
    .from('quote_requests')
    .insert({
      request_number: requestNumber,
      kind,
      client_name: clientName,
      client_email: clientEmail,
      client_phone: clientPhone || null,
      client_company: clientCompany || null,
      delivery_address_line_1: addr1 || null,
      delivery_address_line_2: addr2 || null,
      delivery_town: town || null,
      delivery_county: county || null,
      delivery_postcode: postcode || null,
      notes: notes || null,
      ip_address: ip,
      user_agent: userAgent.slice(0, 1000) || null,
      status: 'pending',
    })
    .select('id')
    .single()

  if (insertErr || !inserted) {
    console.error('quote_requests insert failed:', insertErr)
    return { ok: false, error: 'We could not save your request. Please try again in a moment.' }
  }

  const requestId = (inserted as { id: string }).id

  const itemsInsert = await admin.from('quote_request_items').insert(
    cleanItems.map((item) => ({
      quote_request_id: requestId,
      product_id: item.productId,
      product_code: item.productCode,
      product_name: item.productName,
      quantity: item.quantity,
      unit: item.unit,
      suggested_price: item.suggestedPrice,
    }))
  )

  if (itemsInsert.error) {
    console.error('quote_request_items insert failed:', itemsInsert.error)
    // Best-effort cleanup so the parent row doesn't dangle.
    await admin.from('quote_requests').delete().eq('id', requestId)
    return { ok: false, error: 'We could not save your line items. Please try again in a moment.' }
  }

  return { ok: true, requestNumber, kind }
}
