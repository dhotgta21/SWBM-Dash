# HANDOFF

## Mode
Brownfield bugfix campaign - complete pending final commit/report.

## Stage
S8/S11 wrap: four P0 fixes landed. Next session: redeploy and spot-check production guides + address lookup with rotated key.

## Active paths
- `docs/lifecycle/requirements.md`
- `docs/lifecycle/understanding.md`
- `docs/lifecycle/task-breakdown.md`
- `docs/lifecycle/project-state.json`

## Next action
1. Confirm production deploy after merge.
2. On live site: open a guide detail; create invoice and print; type a postcode on new invoice.

## Do not
- Re-bootstrap full greenfield lifecycle.
- Revert invoice preview path without checking `invoiceId` preference first.
