# HANDOFF

## Mode
Demo Builder Merchant campaign – **complete**. Residual is operator deploy/seed.

## Stage
S11 done. Plan removed.

## What shipped
- Demo-aware brand (`NEXT_PUBLIC_DEMO_MODE`)
- Vertical packs (`NEXT_PUBLIC_DEMO_VERTICAL`)
- Seed scripts: history + vertical SKUs
- Runbook: `docs/demo/RUNBOOK.md`

## Next action (operator)
1. Create/use demo Supabase + Vercel.
2. Set demo env vars (see RUNBOOK).
3. Bootstrap admin via `/register`.
4. `DEMO_SEED_CONFIRM=yes npm run seed:demo -- --wipe-first` (or with flags).
5. `DEMO_SEED_CONFIRM=yes npm run seed:demo:verticals`.
6. Walk the demo script in the runbook before the client visit.

## Do not
- Wipe production customer data.
- Expect multi-tenant isolation (single company row).
