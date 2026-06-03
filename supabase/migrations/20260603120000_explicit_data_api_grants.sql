-- ============================================================
-- Explicit Data API grants
-- (Supabase "Data API exposure" breaking change — Oct 30, 2026)
-- ============================================================
-- Why this exists:
--   From 2026-10-30 Supabase stops auto-granting table privileges to
--   the anon / authenticated / service_role roles for new tables in the
--   public schema. Tables then need EXPLICIT grants to be reachable via
--   the Data API (PostgREST / GraphQL / supabase-js).
--
--   Our existing tables keep their implicit grants on the live project,
--   so this migration is a no-op there today. Its real job is to make
--   the grants our app depends on part of the schema, so that:
--     * a fresh `supabase db reset` (local) or a brand-new project
--       rebuilt from these migrations stays fully functional after the
--       default flips, and
--     * table reachability is explicit, diffable, and greppable.
--
--   GRANT is idempotent — this migration is safe to re-run.
--
-- Role policy for this project:
--   authenticated -> full CRUD on every app table. Row-level visibility
--                    is still enforced by RLS (auth.uid() = user_id);
--                    grants only decide whether the role can touch the
--                    table at all, not which rows it sees.
--   service_role  -> full CRUD. Used server-side and by Edge Functions
--                    (e.g. extract-data-from-expense-image). Bypasses
--                    RLS by design; granted explicitly so server access
--                    survives the new default.
--   anon          -> NO grants (see optional block at the bottom). The
--                    app is email-gated and every policy requires
--                    auth.uid(), which anon never has, so anon access is
--                    neither needed nor wanted.
--
-- Not covered here, on purpose:
--   * Functions/RPC — public.get_user_report_years() already GRANTs
--     EXECUTE to authenticated in its own migration. Keep that pattern
--     for any future function.
--   * Sequences — all tables use gen_random_uuid() UUID primary keys, so
--     there are no sequences to grant. If you ever add a serial / identity
--     column, also: GRANT USAGE, SELECT ON <sequence> TO authenticated;
--   * Default privileges are deliberately left untouched (we are not
--     opting the live project into the new behaviour early).
-- ============================================================

-- ------------------------------------------------------------
-- authenticated: full CRUD on all application tables
-- ------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pdf_records    TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expenses       TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.budget_targets TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.income_goals   TO authenticated;

-- ------------------------------------------------------------
-- service_role: full CRUD for server-side / Edge Function access
-- ------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pdf_records    TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expenses       TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.budget_targets TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.income_goals   TO service_role;
