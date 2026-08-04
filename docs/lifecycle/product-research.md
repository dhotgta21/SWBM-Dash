# Product Research - Demo Builder Merchant / multi-vertical trade platform

- **Status:** DONE (lightweight)
- **Updated:** 2026-08-04
- **Trigger:** User wants industry-agnostic merchant demo (construction, plumbing, electrical, windows, tile) with dense trading history
- **Method:** Codebase constraints + domain patterns for B2B trade-merchant demos (no external competitor scrape required; scope is packaging an existing product)

## 1. Category overview

**What this product is:** A single-tenant trade merchant OS: public marketing + catalogue/quote, staff CRM (clients, invoices, payments), warehouse-ish picker/driver roles, client portal.

**Demo category:** Sales demo environments for vertical SaaS. Best demos combine:

1. Believable brand for the session
2. Dense historical data so analytics and lists are not empty
3. Industry-flavoured marketing so the prospect maps the product to their business
4. Resetability between meetings

## 2. Jobs to be done (presenter)

| JTBD | Why it matters |
|------|----------------|
| "Show a live system, not slides" | Credibility |
| "Show my industry on the homepage" | Instant relevance |
| "Open a client and see years of invoices" | Depth of product |
| "Create an invoice live" | Trust in daily workflow |
| "Reset after the meeting" | Hygiene for next demo |

## 3. P0 / P1 / P2 matrix (research → product)

| Priority | Capability | Rationale |
|----------|------------|-----------|
| P0 | Realistic multi-year ledger seed | Empty dashboards kill demos |
| P0 | Demo brand (Demo Builder Merchant) | Avoid confusing production Star Hawk identity |
| P0 | Default construction vertical complete | Catalog already exists |
| P0 | Wipe + reseed runbook | Repeatable demos |
| P1 | Switchable vertical packs (landing + categories + sample SKUs) | "Works for anyone" claim needs evidence |
| P1 | Mix of client activity tiers | Weekly vs fortnightly patterns |
| P2 | Full multi-tenant | Wrong size for sales demo |
| P2 | Full editorial rewrite per vertical | High cost, low meeting impact vs dashboard data |

## 4. Vertical pack pattern (recommended)

Industry demos that are **not** multi-tenant usually use:

```text
vertical pack = {
  id, displayName,
  hero, trust, FAQ, services blurb,
  category list + blurbs,
  product seed subset,
  SEO keywords,
  optional calculator visibility
}
```

**Switch mechanism options scored for THIS repo:**

| Option | Fit | Cost | Risk |
|--------|-----|------|------|
| A. Env/settings content packs, one DB | High | Medium | Low schema risk |
| B. Separate deploy + DB per vertical | Medium | High ops | Drift between deploys |
| C. True multi-tenant | Low for demo | Very high | Touches RLS everywhere |
| D. Construction only + verbal story | Medium | Low | Weaker "anyone can use it" proof |

**Locked recommendation for plan (pending user confirm):** **Option A**.

## 5. Realistic trading history (domain rules for seeder)

Trade merchants typically see:

- Core accounts ordering on a **project rhythm** (weekly drops during live jobs, quiet between jobs)
- Mix of **collection** and **delivery**
- Line counts: small top-up (2–5 lines) vs site load-out (8–15 lines)
- Status mix: mostly paid historical; some partial/overdue for drama on dashboard; few drafts
- Quotations convert into invoices for a subset of clients

**Seeder tiers (suggested):**

| Tier | Share of 100 clients | Cadence | Notes |
|------|----------------------|---------|-------|
| Hot | ~20% | 1–2 invoices/week | Large sites / merchants |
| Steady | ~50% | ~1 every 1–2 weeks | Regular trade accounts |
| Quiet | ~30% | Monthly / bursty | Seasonal or small accounts |

History window: **30 months** (~2.5 years) balances "rich charts" vs seed time.

## 6. What to mirror vs skip

| Mirror | Skip for this campaign |
|--------|------------------------|
| Dense CRM + invoice history | Multi-org tenancy |
| Brand swap via settings + fallbacks | Rewriting 50+ case studies day one |
| Landing pack switch | Separate product per industry |
| Sample SKUs for extra verticals | Complete plumbing/electrical wholesale catalogs |

## 7. Implications for requirements

- Confirms R1–R8 as P0.
- R9–R10 as the right way to prove multi-industry without multi-tenant.
- Seed architecture must use direct Postgres (document numbers, bulk volume).
