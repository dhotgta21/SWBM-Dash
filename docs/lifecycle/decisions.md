# Decision Records - Demo Builder Merchant

- **Status:** ACTIVE
- **Updated:** 2026-08-04

### D-001 - Vertical presentation model
- **Status:** LOCKED
- **Date:** 2026-08-04
- **Blast radius:** medium
- **Context:** Prospect demos need construction, plumbing, electrical, windows, tile storytelling without rebuilding multi-tenant SaaS.
- **Constraints:** Single `company_settings` row; existing construction catalog; brownfield Next.js app.

| Option | Summary | Pros | Cons | Score |
|--------|---------|------|------|-------|
| A | Switchable content packs (env/settings) in one deploy | Low schema risk; fast; fits sales demo | Soft multi-brand only | 9 |
| B | Separate deploy + DB per vertical | Clean isolation | Ops heavy; drift | 5 |
| C | True multi-tenant orgs | Real product multi-merchant | 6ÔÇô12+ weeks; wrong for demo | 2 |

- **Chosen:** A
- **Why best for our case:** Confirmed in understanding; delivers "works for any trade" without RLS rewrite.
- **Rejected:** B (ops cost), C (overbuild)
- **Implications:** `lib/demo/verticals/*` (or similar) + landing consumers; seed may activate product subsets.
- **Revisit if:** Customer buys multi-merchant productization.

### D-002 - Historical invoice seeding approach
- **Status:** LOCKED
- **Date:** 2026-08-04
- **Blast radius:** medium
- **Context:** Need ~100 clients and ~2.5 years of invoices. App `generate_document_number` uses `now()` only.
- **Constraints:** `created_by` FK; unique document_number; payments trigger status; wipe script pattern exists.

| Option | Summary | Pros | Cons | Score |
|--------|---------|------|------|-------|
| A | Direct Postgres/`pg` bulk insert (mirror wipe) | Fast; historical dates; no captcha | Bypasses app validation (must reimplement VAT carefully) | 9 |
| B | Call server actions in a loop | Uses real app path | Slow; captcha; year lock on RPC | 2 |
| C | SQL dump fixtures only | Simple re-import | Hard to regenerate; large binary-ish dumps | 4 |

- **Chosen:** A
- **Why best for our case:** Matches existing wipe tooling; only viable path for backdated document numbers at volume.
- **Rejected:** B, C
- **Implications:** `scripts/seed-demo-history.mjs` (+ optional SQL helpers); share VAT math with `lib/vat.ts` logic or port carefully; require `DEMO_SEED_CONFIRM=yes`.
- **Revisit if:** App gains a supported historical import API.

### D-003 - Brand defaults strategy
- **Status:** LOCKED
- **Date:** 2026-08-04
- **Blast radius:** medium
- **Context:** Demo should say Demo Builder Merchant; production Star Hawk should not break if same codebase is deployed without demo env.
- **Constraints:** Many hardcoded Star Hawk strings; company_settings is runtime source of truth.

| Option | Summary | Pros | Cons | Score |
|--------|---------|------|------|-------|
| A | Demo-aware: env/`DEMO_MODE` + seed company_settings; keep Star Hawk fallbacks when unset | Safe dual use | Slight dual-brand complexity | 9 |
| B | Hard-rename all defaults to Demo in repo | Simple demo | Breaks production brand assumptions | 3 |
| C | Settings-only (no code) | Zero code | SEO/hero still Star Hawk | 4 |

- **Chosen:** A
- **Why best for our case:** User approved keeping production defaults when demo env unset.
- **Rejected:** B, C
- **Implications:** Central helper for site name; seed sets company_settings; patch critical chrome/SEO paths to use helper + DB.
- **Revisit if:** Repo permanently forks as demo-only product.

### D-004 - Seed volume parameters
- **Status:** LOCKED
- **Date:** 2026-08-04
- **Blast radius:** small-medium
- **Context:** Density for charts vs seed runtime.

| Option | Summary | Pros | Cons |
|--------|---------|------|------|
| A | 100 clients, 30 months, tiers hot/steady/quiet | Matches confirmed understanding | Longer seed |
| B | 40 clients, 12 months | Faster | Thin charts |
| C | 200 clients, 36 months | Very dense | Slow; may stress UI |

- **Chosen:** A (with CLI flags to scale down for local dev: e.g. `--clients 20 --months 12`)
- **Why:** Confirmed with user; flags mitigate local time.
- **Implications:** Default full density on demo host; document flags in runbook.

### D-005 - Non-construction product depth (P1)
- **Status:** LOCKED
- **Date:** 2026-08-04
- **Blast radius:** medium
- **Context:** Plumbing/electrical/windows/tile need something in catalogue when pack active.

| Option | Summary | Pros | Cons |
|--------|---------|------|------|
| A | 30ÔÇô80 sample SKUs per vertical + category meta + placeholder/real images | Credible browse | Content work |
| B | Landing-only copy change, empty catalogue | Fast | Weak proof |
| C | Full industry catalog scrape | Deep | Out of scope / time |

- **Chosen:** A for P1 phase
- **Why:** Understanding P1; enough for demo walk without multi-week catalog projects.
- **Implications:** Separate seed step per vertical or pack-driven product seed; construction keeps existing products.

---

## DR-001: Single re-auth factor = login password

**Status:** LOCKED  
**Context:** Operators faced separate payment / deletion / client-account passwords plus username fields. User wants only login password and settings fields removed.

**Options:**
1. Drop username only; keep action passwords  
2. Login password for invoice delete + direct payment only  
3. Login password for all operator re-auth (payment, delete/restore, client account); remove Security action-password UI  

**Choice:** 3  
**Why:** Matches "nothing different" and one mental model. `verifyOperatorPassword` already exists. Soft-delete RPCs need a migration to stop checking deletion hashes.  
**Consequences:** Soft-delete/restore use service_role after login re-auth (migration 163). Login password remains the UX re-auth factor.
