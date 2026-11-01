-- ============================================================
-- Business date: optional fixed value for the test database
-- ============================================================
-- Every "today" in the business logic goes through
-- app_private.business_today() (career periods, "not in the future",
-- planned transfers, rule publishing, …). The pgTAP suite was written
-- against a fixed calendar, so it started failing as real time moved on
-- (first on 2026-12-01).
--
-- The database setting `app.business_today` (a date) now overrides the
-- clock. Only scripts/db-test.sh sets it, on its throwaway database
-- (ALTER DATABASE … SET), and tests may move it with
-- SET LOCAL app.business_today = '…' to act on a given day.
-- Hosted projects never set it, so production keeps using Berlin time.
-- The API cannot set it: PostgREST only sets request.* settings, and no
-- exposed function calls set_config.
-- ============================================================

CREATE OR REPLACE FUNCTION app_private.business_today()
RETURNS date
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT coalesce(nullif(current_setting('app.business_today', true), '')::date,
                  (now() AT TIME ZONE 'Europe/Berlin')::date)
$$;
