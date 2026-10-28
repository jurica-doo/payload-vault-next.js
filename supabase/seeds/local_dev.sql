-- ============================================================
-- Local development seed: admin, adviser and a vault-only account
-- ============================================================
-- Loaded by `supabase db reset` (and by `supabase start` on a fresh volume)
-- through [db.seed] in supabase/config.toml. Deliberately NOT named
-- supabase/seed.sql: scripts/db-test.sh (pgTAP, CI) loads that file before
-- the tests, and these users would skew their assertions.
--
--   admin@test.com    / 123456         admin role, level TL, leads Max
--   user@test.com     / 123456         adviser (no role), level FA
--   vault@test.com    / 123456         vault only: no employee record
--
-- Admin and adviser go through the real invite gate: employee + open invite
-- first, then the auth user (link trigger), then the email confirmation
-- (activation trigger), exactly like an accepted invite in the app.
--
-- Also switches every sales module on and schedules the task generators.
-- Local only. Never run this against staging or production.
-- ============================================================

DO $$
DECLARE
  v_password constant text := '123456';
  v_start    constant date := DATE '2026-01-01';
  v_people   constant jsonb := '[
    {"email": "admin@test.com",   "first": "Erika", "last": "Mustermann", "level": "TL", "admin": true},
    {"email": "user@test.com", "first": "Max",   "last": "Mustermann", "level": "FA", "admin": false}
  ]';
  v_p        jsonb;
  v_user     uuid;
  v_emp      uuid;
BEGIN
  FOR v_p IN SELECT * FROM jsonb_array_elements(v_people) LOOP
    IF EXISTS (SELECT 1 FROM auth.users WHERE email = v_p ->> 'email') THEN
      RAISE NOTICE 'seed: % already exists, skipped', v_p ->> 'email';
      CONTINUE;
    END IF;

    INSERT INTO public.employees (first_name, last_name, email, start_date)
    VALUES (v_p ->> 'first', v_p ->> 'last', v_p ->> 'email', v_start)
    RETURNING id INTO v_emp;

    INSERT INTO public.employee_invites (employee_id, email, expires_at)
    VALUES (v_emp, v_p ->> 'email', now() + interval '1 day');

    -- GoTrue scans the token columns as strings: they must be '' not NULL,
    -- otherwise password login fails with "Database error querying schema".
    v_user := gen_random_uuid();
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change, email_change_token_new)
    VALUES (
      '00000000-0000-0000-0000-000000000000', v_user, 'authenticated', 'authenticated',
      v_p ->> 'email', extensions.crypt(v_password, extensions.gen_salt('bf')),
      '{"provider": "email", "providers": ["email"]}', '{}', now(), now(),
      '', '', '', '');

    INSERT INTO auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
    VALUES (
      gen_random_uuid(), v_user, v_user::text, 'email',
      jsonb_build_object('sub', v_user::text, 'email', v_p ->> 'email', 'email_verified', true),
      now(), now(), now());

    -- Fires app_private.activate_on_confirm: employee active, invite accepted.
    UPDATE auth.users SET email_confirmed_at = now() WHERE id = v_user;

    INSERT INTO public.career_level_history (employee_id, level_code, effective_from, source, reason)
    VALUES (v_emp, v_p ->> 'level', v_start, 'initial', 'Lokaler Entwicklungs-Seed');

    IF (v_p ->> 'admin')::boolean THEN
      PERFORM app_private.bootstrap_admin(v_p ->> 'email');
    END IF;
  END LOOP;

  -- Reporting line: Max reports to Erika (Erika is top level).
  INSERT INTO public.hierarchy_assignments (employee_id, manager_id, effective_from, change_reason)
  SELECT e.id, m.id, v_start, 'Lokaler Entwicklungs-Seed'
    FROM public.employees e
    LEFT JOIN public.employees m
      ON m.email = 'admin@test.com' AND e.email = 'user@test.com'
   WHERE e.email IN ('admin@test.com', 'user@test.com')
     AND NOT EXISTS (SELECT 1 FROM public.hierarchy_assignments h WHERE h.employee_id = e.id);

  PERFORM app_private.generate_periods(e.id) FROM public.employees e;
END
$$;

-- Vault-only account, like the users from before the sales system: it has no
-- employee record, so it sees only "Mein Tresor". Without an employee there
-- is no invite, so the auth user is inserted with triggers off (the invite
-- gate would reject it), the same way tests.create_user() does it in pgTAP.
DO $$
DECLARE
  v_user uuid := gen_random_uuid();
BEGIN
  IF EXISTS (SELECT 1 FROM auth.users WHERE email = 'vault@test.com') THEN
    RAISE NOTICE 'seed: vault@test.com already exists, skipped';
    RETURN;
  END IF;

  SET LOCAL session_replication_role = replica;
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change, email_change_token_new)
  VALUES (
    '00000000-0000-0000-0000-000000000000', v_user, 'authenticated', 'authenticated',
    'vault@test.com', extensions.crypt('123456', extensions.gen_salt('bf')), now(),
    '{"provider": "email", "providers": ["email"]}', '{}', now(), now(),
    '', '', '', '');
  INSERT INTO auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
  VALUES (
    gen_random_uuid(), v_user, v_user::text, 'email',
    jsonb_build_object('sub', v_user::text, 'email', 'vault@test.com', 'email_verified', true),
    now(), now(), now());
  SET LOCAL session_replication_role = origin;
END
$$;

-- Every sales module on (a module shows when "sales" and its own key are true).
UPDATE public.app_settings
   SET value = value || '{"sales": true, "production": true, "career": true, "team": true, "commission": true,
                          "goals": true, "leads": true, "tasks": true, "customers": true, "admin": true}'::jsonb,
       updated_at = now()
 WHERE key = 'feature_flags';

-- Task generators every 15 minutes. Optional: a missing pg_cron must not
-- break the seed.
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;
  RAISE NOTICE 'seed: task generators %', app_private.schedule_jobs();
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'seed: pg_cron not available (%), task generators not scheduled', SQLERRM;
END
$$;
