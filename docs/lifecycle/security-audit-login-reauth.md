# Security notes: F-login-reauth

## Change summary
Protected operator actions re-verify **login password** via `verifyOperatorPassword` (isolated `signInWithPassword` + immediate signOut; no cookie rotation).

## Surfaces covered
- `createPayment` / mark paid
- Soft-delete: invoice, payment, client, product, campaign
- Restore: client, product, invoice
- Client account: deposit, apply balance, pay from account

## Mitigations retained
- Session auth (`getUser`) + permission checks
- Rate limits on payment verify and delete RPCs
- Soft-delete RPCs still require non-empty `p_password` param
- App layer rejects wrong login password before RPC

## Residual risk (after hardening)
- Soft-delete/restore RPCs are **service_role only** (EXECUTE revoked from `authenticated`). Browser JWT cannot call them with a dummy password.
- App path: `verifyOperatorPassword` then `reauthThenSoftDeleteRpc` with `p_operator_id` and sentinel `p_password` (login secret not sent to Postgres).
- Direct payment insert / wallet RPCs still rely on session + permissions (pre-existing; not introduced by this feature). Optional follow-up to require re-auth tokens for those APIs.
- Legacy `user_security` hash columns / change_* RPCs remain in DB (unused by UI). Settings change actions return deprecation errors.

## Verdict
**pass** for product intent (login password only, settings fields removed) with soft-delete RPC boundary fixed.
