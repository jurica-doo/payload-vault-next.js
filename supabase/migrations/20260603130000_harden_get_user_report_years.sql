-- ============================================================
-- Harden public.get_user_report_years()
-- Clears Security Advisor lints 0028 / 0029
-- (SECURITY DEFINER function executable by anon / authenticated)
-- ============================================================
-- Background:
--   The function was SECURITY DEFINER, so it bypassed RLS and ran with
--   the owner's privileges. Postgres also auto-grants EXECUTE on new
--   functions to PUBLIC, so the `anon` role could call it via
--   /rest/v1/rpc/get_user_report_years (it returned no rows, because
--   auth.uid() is NULL for anon, but the advisor flags the pattern).
--
-- Fix:
--   * Switch to SECURITY INVOKER. The function only ever reads the
--     caller's own rows from pdf_records / expenses, both of which
--     already enforce RLS (auth.uid() = user_id). Running as the caller
--     lets RLS do the enforcement instead of trusted definer code, and
--     removes the function from both lints (they target DEFINER only).
--   * Revoke the implicit PUBLIC / anon EXECUTE grant and grant EXECUTE
--     only to authenticated — the single role that actually calls it
--     (browser hook useAvailableYears, gated behind a signed-in user).
--
-- Behaviour is unchanged: authenticated has SELECT on both tables and
-- RLS returns exactly the user's own rows — the same result the DEFINER
-- version produced via its WHERE clause. Idempotent and safe to re-run.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_user_report_years()
RETURNS TABLE (year integer)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT DISTINCT year FROM (
    SELECT EXTRACT(YEAR FROM date_created)::integer AS year
    FROM public.pdf_records
    WHERE user_id = auth.uid()

    UNION

    SELECT EXTRACT(YEAR FROM expense_date)::integer AS year
    FROM public.expenses
    WHERE user_id = auth.uid()
  ) combined
  ORDER BY year DESC;
$$;

-- Remove the implicit world-executable grant, keep it for signed-in users only.
REVOKE EXECUTE ON FUNCTION public.get_user_report_years() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_user_report_years() TO authenticated;
