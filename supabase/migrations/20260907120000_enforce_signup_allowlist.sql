-- ============================================================
-- Server-side enforcement of the test-phase signup allowlist
-- ============================================================
-- The problem this fixes:
--   The allowlist lived only in src/validation/SignUpValidation.ts, as a zod
--   `.refine()` over NEXT_PUBLIC_ALLOWED_EMAILS. That check runs exclusively in
--   the browser, and NEXT_PUBLIC_* values are compiled into the client bundle,
--   so it is not an access control at all — it is a UX hint.
--
--   The Supabase anon key is likewise public by design (it ships in the same
--   bundle), and the project has enable_signup = true. Anyone could therefore
--   skip the app entirely and create an account with a plain HTTP call:
--
--       POST https://<project>.supabase.co/auth/v1/signup
--       apikey: <public anon key>
--       {"email":"attacker@example.com","password":"..."}
--
--   The resulting account gets the `authenticated` role. RLS still confines it
--   to its own rows, so other users' documents stay private — but the account
--   does gain everything that role can reach, most importantly the
--   extract-data-from-expense-image Edge Function, which spends the project
--   owner's Google Gemini quota, plus storage space in the invoice buckets.
--   That is unauthorised use of a paid resource and it defeats the entire
--   point of the test-phase gate.
--
-- The fix:
--   Move the decision into the database, on the INSERT path that *every*
--   signup route must pass through — the app, the REST API, the dashboard and
--   any future OAuth provider alike. A BEFORE INSERT trigger on auth.users
--   rejects addresses that are not on the list.
--
-- Behaviour change to be aware of:
--   This trigger FAILS CLOSED. With an empty allowlist table no new account can
--   be created. Existing accounts are untouched (the trigger only fires on
--   INSERT) and are backfilled into the list below so the current state is
--   self-documenting. To invite someone new, add their address:
--
--       INSERT INTO public.signup_allowlist (email) VALUES ('new@example.com');
--
--   Fail-closed is deliberate: the previous behaviour of "no list configured =>
--   allow everyone" is exactly the hole being closed here.
-- ============================================================

-- ------------------------------------------------------------
-- The allowlist itself
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.signup_allowlist (
  email      TEXT PRIMARY KEY,
  note       TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  CONSTRAINT signup_allowlist_email_is_lowercase CHECK (email = lower(email)),
  CONSTRAINT signup_allowlist_email_shape CHECK (email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')
);

-- RLS on with deliberately NO policies: this is a deny-all table for every
-- client-facing role. Knowing who is invited to a private beta is not something
-- anon or authenticated should be able to enumerate, and nothing in the app
-- reads it. The trigger below reaches it as SECURITY DEFINER instead.
ALTER TABLE public.signup_allowlist ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.signup_allowlist FROM PUBLIC;
REVOKE ALL ON public.signup_allowlist FROM anon, authenticated;

-- ------------------------------------------------------------
-- Backfill: everyone who already has an account stays valid
-- ------------------------------------------------------------
INSERT INTO public.signup_allowlist (email, note)
SELECT DISTINCT lower(u.email), 'backfilled from existing auth.users'
FROM auth.users u
WHERE u.email IS NOT NULL
  AND lower(u.email) ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
ON CONFLICT (email) DO NOTHING;

-- ------------------------------------------------------------
-- Enforcement trigger
-- ------------------------------------------------------------
-- SECURITY DEFINER so the function reads signup_allowlist with the owner's
-- rights rather than those of supabase_auth_admin (the role that performs the
-- INSERT), independently of the deny-all RLS above.
-- search_path is pinned so a malicious object in a user-controlled schema
-- cannot shadow `signup_allowlist` or the operators used below.
CREATE OR REPLACE FUNCTION public.enforce_signup_allowlist()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  candidate TEXT;
BEGIN
  candidate := lower(trim(NEW.email));

  IF candidate IS NULL OR candidate = '' THEN
    RAISE EXCEPTION 'Registrierung ist derzeit nur für freigegebene E-Mail-Adressen möglich.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.signup_allowlist a WHERE a.email = candidate
  ) THEN
    -- Deliberately identical wording for "not invited" and "malformed": the
    -- response must not tell an anonymous caller which addresses are on the
    -- list, otherwise the endpoint becomes an allowlist oracle.
    RAISE EXCEPTION 'Registrierung ist derzeit nur für freigegebene E-Mail-Adressen möglich.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enforce_signup_allowlist() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS enforce_signup_allowlist_trigger ON auth.users;
CREATE TRIGGER enforce_signup_allowlist_trigger
  BEFORE INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_signup_allowlist();
