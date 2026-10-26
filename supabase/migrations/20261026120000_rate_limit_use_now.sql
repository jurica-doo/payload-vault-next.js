-- ============================================================
-- consume_rate_limit: compare timestamptz with timestamptz
-- ============================================================
-- 20260907122000_edge_rate_limits.sql wrote `timezone('utc'::text, now())`
-- into edge_rate_limits.window_start. That expression yields a TIMESTAMP
-- WITHOUT TIME ZONE (UTC wall-clock time), which Postgres then casts back to
-- TIMESTAMPTZ using the *session* TimeZone. The result is only correct while
-- that setting is UTC — true on Supabase by default, but a per-role or
-- per-database `SET timezone` would silently shift every window by the UTC
-- offset (e.g. a 60 s window becoming 2 h + 60 s in CEST, or never resetting).
--
-- now() is already an absolute instant (timestamptz), so it needs no
-- conversion and is correct under any session time zone. Existing rows were
-- written while the session zone was UTC and are therefore already correct.
-- ============================================================

ALTER TABLE public.edge_rate_limits
  ALTER COLUMN window_start SET DEFAULT now();

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
  v_now    TIMESTAMPTZ := now();
  v_cutoff TIMESTAMPTZ;
BEGIN
  IF p_key IS NULL OR p_key = '' OR p_limit IS NULL OR p_limit <= 0 THEN
    RETURN FALSE;
  END IF;

  v_cutoff := v_now - make_interval(secs => GREATEST(p_window_seconds, 1));

  INSERT INTO public.edge_rate_limits AS r (key, window_start, count)
  VALUES (p_key, v_now, 1)
  ON CONFLICT (key) DO UPDATE
    SET count = CASE WHEN r.window_start < v_cutoff THEN 1 ELSE r.count + 1 END,
        window_start = CASE WHEN r.window_start < v_cutoff
                            THEN v_now
                            ELSE r.window_start END
  RETURNING r.count INTO v_count;

  RETURN v_count <= p_limit;
END;
$$;

-- CREATE OR REPLACE keeps existing grants, but re-assert them so a fresh
-- rebuild from migrations cannot drift.
REVOKE EXECUTE ON FUNCTION public.consume_rate_limit(TEXT, INTEGER, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_rate_limit(TEXT, INTEGER, INTEGER)
  TO service_role;
