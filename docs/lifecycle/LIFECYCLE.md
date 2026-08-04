# LIFECYCLE: Demo Builder Merchant campaign

## Project
SWBM codebase → **Demo Builder Merchant** sales demo packaging.

## Mode
build (brownfield) – **complete**

## Approvals
- Understanding: CONFIRMED
- Plan: APPROVED then COMPLETED (file deleted)

## Stage board

| Stage | Status | Notes |
|-------|--------|-------|
| S0–S3 | done | Report, requirements, research, understanding, tasks |
| S4 | skipped | Existing app |
| S5 | done | product-foundation; design-inspiration NONE |
| S6–S7 | done | Brand + packs + seed scripts |
| S8 | done | Implement-check |
| S9 | done | vitest brand + tsc; live seed = operator |
| S10–S11 | done | All in-run features gated |

## Features
All in-run features mark-done: F-demo-brand, F-demo-seed, F-demo-runbook, F-vertical-packs, F-vertical-skus.

## Sacred contracts
D-001 packs · D-002 Postgres seed · D-003 demo-aware brand · D-004 volume · D-005 sample SKUs

## Next
Operator deploy + seed per `docs/demo/RUNBOOK.md`.
