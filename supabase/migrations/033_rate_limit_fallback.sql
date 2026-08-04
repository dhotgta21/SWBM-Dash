-- Ensure the shared rate-limit store exists for deployments that apply
-- numbered migrations without the consolidated schema.sql (e.g. Supabase CLI).
-- Without this, the public invoice page and auth flows fail closed when the
-- lib/rate-limit.ts RPC is missing.

CREATE TABLE IF NOT EXISTS public.rate_limits (
  key text NOT NULL,
  window_start timestamptz NOT NULL,
  count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (key, window_start)
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_window_start
  ON public.rate_limits(window_start);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'rate_limits_key_length'
  ) THEN
    ALTER TABLE public.rate_limits
      ADD CONSTRAINT rate_limits_key_length
      CHECK (char_length(key) BETWEEN 1 AND 200);
  END IF;
END $$;

ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_key text,
  p_max integer,
  p_window_seconds integer
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_window_start timestamptz;
  v_count integer;
BEGIN
  IF p_key IS NULL OR char_length(p_key) = 0 OR char_length(p_key) > 200 THEN
    RAISE EXCEPTION 'rate_limit key must be 1..200 chars';
  END IF;
  IF p_max IS NULL OR p_max <= 0 OR p_max > 100000 THEN
    RAISE EXCEPTION 'rate_limit max must be 1..100000';
  END IF;
  IF p_window_seconds IS NULL OR p_window_seconds < 1 OR p_window_seconds > 86400 THEN
    RAISE EXCEPTION 'rate_limit window must be 1..86400';
  END IF;

  v_window_start := to_timestamp(
    floor(extract(epoch FROM now()) / p_window_seconds) * p_window_seconds
  );

  INSERT INTO public.rate_limits (key, window_start, count, updated_at)
  VALUES (p_key, v_window_start, 1, now())
  ON CONFLICT (key, window_start)
  DO UPDATE SET count = public.rate_limits.count + 1, updated_at = now()
  RETURNING count INTO v_count;

  IF (SELECT count(*) FROM public.rate_limits) > 10000 THEN
    DELETE FROM public.rate_limits
     WHERE window_start < (now() - interval '1 day');
  END IF;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, integer, integer) TO anon, authenticated;
