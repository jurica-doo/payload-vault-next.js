-- ============================================================
-- Shared rate-limit counter for Edge Functions
-- ============================================================
-- Why:
--   extract-data-from-expense-image limited callers with a module-level
--   `Map` — state that lives inside one warm Deno isolate. Supabase runs many
--   isolates concurrently and recycles them aggressively, so the effective
--   limit was "10 requests per minute per isolate a caller happens to land on",
--   which a client can multiply simply by sending requests in parallel, and
--   which resets to zero whenever an isolate is cold-started. Every one of
--   those requests spends the project owner's Gemini quota on a multimodal
--   call, so the limiter guarded real money and did not actually hold.
--
--   Postgres is the one piece of shared, durable state every isolate already
--   talks to, so the counter goes here.
--
-- Design notes:
--   * Fixed window, keyed by an opaque string (the caller's user id). A fixed
--     window can allow up to 2x the limit across a boundary; that is fine for
--     abuse control and keeps the implementation a single atomic statement.
--   * The INSERT .. ON CONFLICT DO UPDATE takes a row lock, so concurrent
--     callers serialise on the key and the count cannot be lost to a race.
--   * SECURITY DEFINER + EXECUTE granted only to service_role: the Edge
--     Function holds the service key, and no browser client can reach this to
--     forge or reset its own counter.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.edge_rate_limits (
  key          TEXT PRIMARY KEY,
  window_start TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now()),
  count        INTEGER NOT NULL DEFAULT 0
);

-- Deny-all for client roles; only the definer function touches this.
ALTER TABLE public.edge_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.edge_rate_limits FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.consume_rate_limit(
  p_key            TEXT,
  p_limit          INTEGER,
  p_window_seconds INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count  INTEGER;
  v_cutoff TIMESTAMPTZ;
BEGIN
  IF p_key IS NULL OR p_key = '' OR p_limit IS NULL OR p_limit <= 0 THEN
    RETURN FALSE;
  END IF;

  v_cutoff := timezone('utc'::text, now()) - make_interval(secs => GREATEST(p_window_seconds, 1));

  INSERT INTO public.edge_rate_limits AS r (key, window_start, count)
  VALUES (p_key, timezone('utc'::text, now()), 1)
  ON CONFLICT (key) DO UPDATE
    SET count = CASE WHEN r.window_start < v_cutoff THEN 1 ELSE r.count + 1 END,
        window_start = CASE WHEN r.window_start < v_cutoff
                            THEN timezone('utc'::text, now())
                            ELSE r.window_start END
  RETURNING r.count INTO v_count;

  RETURN v_count <= p_limit;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.consume_rate_limit(TEXT, INTEGER, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_rate_limit(TEXT, INTEGER, INTEGER)
  TO service_role;
