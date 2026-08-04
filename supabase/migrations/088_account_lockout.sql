-- 088_account_lockout.sql
-- Add columns to support application-level account lockout after repeated
-- failed sign-in attempts. These are checked by lib/actions/auth.ts.

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS failed_sign_in_attempts integer NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS locked_until timestamptz;
