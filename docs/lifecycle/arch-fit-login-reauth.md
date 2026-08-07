# Architecture fit: F-login-reauth

## Verdict: FIT

## Reuse
- Reused existing `verifyOperatorPassword` (was unused) instead of inventing a new re-auth path.
- Kept existing dialog shells (`AccountVerificationDialog`, `DeletionPasswordDialog`) with simplified fields/copy.
- Soft-delete/restore keep stable RPC signatures (`p_password` retained for callers).

## Layering
- Auth proof: app layer (Supabase Auth)
- Authorization + soft-delete: existing SECURITY DEFINER RPCs + permissions
- Settings UI: removed action-password forms; Account remains source of login password

## Anti-patterns avoided
- Did not dual-verify action password + login password
- Did not leave half of Security tabs with dead "set password" UX
