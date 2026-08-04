-- Remove WhatsApp group fields that are no longer used.
-- They were only used for a share-button label and a fallback join tab,
-- not for actual messaging automation.
ALTER TABLE public.company_settings
  DROP CONSTRAINT IF EXISTS company_settings_whatsapp_invite_url;

ALTER TABLE public.company_settings
  DROP COLUMN IF EXISTS whatsapp_group_name,
  DROP COLUMN IF EXISTS whatsapp_group_invite;
