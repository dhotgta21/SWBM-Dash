-- =============================================================================
-- Star Hawk Builders Merchant — 064_remove_ai_designer.sql
-- =============================================================================
-- Reverses 059_ai_designer.sql and 062_ai_designer_conversations.sql.
-- Drops all AI designer related tables, functions, triggers, policies,
-- storage bucket and custom enum.
--
-- Idempotency: every DROP statement uses IF EXISTS so re-running is safe.
-- Trigger/policy drops are additionally guarded by table-existence checks
-- because DROP TRIGGER/POLICY IF EXISTS still require the table to exist.
-- =============================================================================

-- =============================================================================
-- 1. Clean up storage bucket for AI designer uploads
-- =============================================================================
-- Direct deletion from storage.* tables is blocked by Supabase Storage.
-- Run the companion script first:
--   node scripts/remove-ai-designer-bucket.mjs
-- That empties and deletes the 'ai-designer-uploads' bucket via the Storage API.
-- Then this migration drops the leftover storage policies.
DROP POLICY IF EXISTS "AI designer uploads insert" ON storage.objects;
DROP POLICY IF EXISTS "AI designer uploads select own" ON storage.objects;
DROP POLICY IF EXISTS "AI designer uploads delete own" ON storage.objects;

-- =============================================================================
-- 2. Drop AI designer conversations and messages (from 062)
-- =============================================================================
-- Drop triggers and policies only when the target tables still exist.
DO $$
BEGIN
  IF to_regclass('public.ai_messages') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS ai_conversation_leaf_trigger ON public.ai_messages;

    DROP POLICY IF EXISTS ai_messages_user_select ON public.ai_messages;
    DROP POLICY IF EXISTS ai_messages_user_insert ON public.ai_messages;
    DROP POLICY IF EXISTS ai_messages_user_update ON public.ai_messages;
    DROP POLICY IF EXISTS ai_messages_user_delete ON public.ai_messages;
    DROP POLICY IF EXISTS ai_messages_anon_deny ON public.ai_messages;
  END IF;

  IF to_regclass('public.ai_conversations') IS NOT NULL THEN
    DROP POLICY IF EXISTS ai_conversations_user_select ON public.ai_conversations;
    DROP POLICY IF EXISTS ai_conversations_user_insert ON public.ai_conversations;
    DROP POLICY IF EXISTS ai_conversations_user_update ON public.ai_conversations;
    DROP POLICY IF EXISTS ai_conversations_user_delete ON public.ai_conversations;
    DROP POLICY IF EXISTS ai_conversations_anon_deny ON public.ai_conversations;
  END IF;
END $$;

DROP FUNCTION IF EXISTS public.update_ai_conversation_leaf();

-- Drop tables. ai_messages references ai_conversations, so drop it first.
DROP TABLE IF EXISTS public.ai_messages;
DROP TABLE IF EXISTS public.ai_conversations;

-- Drop the custom enum created for AI designer conversations.
DROP TYPE IF EXISTS public.conversation_type;

-- =============================================================================
-- 3. Drop AI designer config / usage / logs (from 059)
-- =============================================================================
DO $$
BEGIN
  IF to_regclass('public.ai_designer_config') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS ai_designer_config_updated_at ON public.ai_designer_config;
    DROP POLICY IF EXISTS ai_designer_config_select ON public.ai_designer_config;
    DROP POLICY IF EXISTS ai_designer_config_update ON public.ai_designer_config;
    DROP POLICY IF EXISTS ai_designer_config_insert ON public.ai_designer_config;
  END IF;

  IF to_regclass('public.ai_designer_usage') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS ai_designer_usage_updated_at ON public.ai_designer_usage;
    DROP POLICY IF EXISTS ai_designer_usage_no_client ON public.ai_designer_usage;
  END IF;

  IF to_regclass('public.ai_designer_api_key') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS ai_designer_api_key_updated_at ON public.ai_designer_api_key;
  END IF;

  IF to_regclass('public.ai_designer_prompt_logs') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS ai_designer_logs_no_client ON public.ai_designer_prompt_logs;
    DROP POLICY IF EXISTS ai_designer_logs_no_client ON public.ai_designer_prompt_logs;
  END IF;
END $$;

-- Drop shared function.
DROP FUNCTION IF EXISTS public.touch_ai_designer_updated_at();

-- Drop tables.
DROP TABLE IF EXISTS public.ai_designer_prompt_logs;
DROP TABLE IF EXISTS public.ai_designer_usage;
DROP TABLE IF EXISTS public.ai_designer_api_key;
DROP TABLE IF EXISTS public.ai_designer_config;
