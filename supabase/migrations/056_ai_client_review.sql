-- 056: track clients created by the AI invoice assistant and whether they have been reviewed
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS ai_created boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reviewed boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.clients.ai_created IS 'True when the client record was created by the AI invoice assistant.';
COMMENT ON COLUMN public.clients.reviewed IS 'False for AI-created clients until a staff member confirms the record is complete.';
