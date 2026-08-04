-- =============================================================================
-- 040_webmail_quick_link.sql
-- =============================================================================
-- Adds a single nullable URL column to public.company_settings that the
-- /emails page uses as a quick-access link to the operator's webmail
-- (Outlook on the web, Gmail, GoDaddy webmail, etc.).
--
-- This is a deliberately tiny feature: a button that opens the URL in a
-- new tab. No OAuth, no IMAP, no API integration. The operator pastes
-- the URL they want to use (e.g. https://outlook.office365.com or
-- https://mail.google.com) and the dashboard renders a one-click shortcut.
--
-- No constraints on the URL — any valid web URL is allowed (we trust the
-- admin who filled it in). A future hardening pass could add a CHECK
-- constraint to https:// only.
-- =============================================================================

ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS webmail_url text;

COMMENT ON COLUMN public.company_settings.webmail_url IS
  'Quick-access URL to the company webmail (Outlook on the web, Gmail, GoDaddy webmail, etc.). Rendered as an ''Open inbox'' button on /emails.';