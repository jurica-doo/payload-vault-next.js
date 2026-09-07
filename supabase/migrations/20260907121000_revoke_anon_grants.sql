-- ============================================================
-- Complete the intent of 20260603120000_explicit_data_api_grants.sql
-- ============================================================
-- That migration documented the role policy as:
--
--     anon -> NO grants (see optional block at the bottom)
--
-- ...but the referenced block was never written, so on the live project the
-- `anon` role kept the table privileges Supabase auto-granted before the
-- Oct 2026 default change.
--
-- Is that exploitable today? No. Every policy on these tables is
-- `auth.uid() = user_id`, and auth.uid() is NULL for anon, so RLS returns zero
-- rows and rejects every write. This migration is defence in depth, not an
-- incident fix. It matters because it removes the dependency on RLS being the
-- *only* thing standing between an unauthenticated caller and the tables: a
-- future table created without RLS, or a policy edited to `USING (true)`,
-- would otherwise be immediately world-readable through the public anon key.
--
-- Least privilege: anon's sole legitimate job in this app is talking to
-- /auth/v1 to sign in. It never needs to touch application data.
-- ============================================================

REVOKE ALL ON public.pdf_records    FROM anon;
REVOKE ALL ON public.expenses       FROM anon;
REVOKE ALL ON public.budget_targets FROM anon;
REVOKE ALL ON public.income_goals   FROM anon;

-- The RPC is already restricted to `authenticated` by
-- 20260603130000_harden_get_user_report_years.sql; re-assert it so a fresh
-- rebuild from migrations cannot drift.
REVOKE EXECUTE ON FUNCTION public.get_user_report_years() FROM PUBLIC, anon;
