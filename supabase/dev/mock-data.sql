-- ============================================================
-- LOCAL DEV ONLY: mock data for looking at the admin screens with content.
--
--   docker exec -i supabase_db_payload-vault psql -U postgres -v ON_ERROR_STOP=1 < supabase/dev/mock-data.sql
--
-- Creates 50 employees (@mock.profina.test) through the real invite flow
-- (employee + invite -> auth user -> confirm), career levels with some
-- promotions, a 7-level hierarchy with history and planned changes, a few
-- finance/compliance roles, production with point calculations (feeds
-- Produktion, Provisionen and the Beförderungen queue) and lead source costs.
-- Mock auth users have no password and cannot sign in.
--
-- Runs once (refuses if mock employees exist). Remove with mock-data-reset.sql.
-- Never run against a shared or production database.
-- ============================================================

BEGIN;

SELECT set_config('app.reason', 'Mock-Daten für lokale Entwicklung', true);
SELECT setseed(0.42);

DO $$
DECLARE
  v_admin_user uuid;
  v_admin_emp  uuid;
  first_names text[] := ARRAY[
    'Lukas','Anna','Maximilian','Sophie','Felix','Marie','Jonas','Laura','Leon','Julia',
    'Paul','Lena','Tim','Hannah','Niklas','Lea','Jan','Sarah','David','Katharina',
    'Moritz','Johanna','Simon','Clara','Tobias','Emily','Fabian','Mia','Florian','Lisa',
    'Sebastian','Nina','Philipp','Carla','Alexander','Vanessa','Daniel','Melanie','Kevin','Sandra',
    'Markus','Christina','Stefan','Jana','Thomas','Isabel','Andreas','Miriam','Benedikt','Theresa'];
  last_names text[] := ARRAY[
    'Müller','Schmidt','Schneider','Fischer','Weber','Meyer','Wagner','Becker','Schulz','Hoffmann',
    'Koch','Richter','Klein','Wolf','Schröder','Neumann','Schwarz','Zimmermann','Braun','Krüger',
    'Hofmann','Hartmann','Lange','Schmitt','Werner','Krause','Meier','Lehmann','Schmid','Schulze',
    'Maier','Köhler','Herrmann','König','Walter','Mayer','Huber','Kaiser','Fuchs','Peters',
    'Lang','Scholz','Möller','Weiß','Jung','Hahn','Vogel','Friedrich','Keller','Günther'];
  -- ASCII local parts for the e-mail addresses.
  first_ascii text[];
  last_ascii  text[];
  emp   uuid[] := '{}';
  usr   uuid[] := '{}';
  lvl   text[] := '{}';
  mgr   int[]  := '{}';
  start date[] := '{}';
  i int; k int; n int;
  v_id uuid; v_user uuid; v_email text; v_level text; v_prev text;
  v_status text; v_deact date; v_start date; v_end date;
  v_pid uuid; v_date date; v_cat text; v_amount numeric; v_period text; v_net text; v_term numeric;
  v_kind text;
  cats text[] := ARRAY['KV','KV','LV','LV','SACH','SACH','KFZ','STROM','GAS'];
  stars int[] := ARRAY[13, 22, 24, 37, 38, 40];
  ladder text[] := ARRAY['FA','FB','TL','OL','DL','RL','VD'];
BEGIN
  IF EXISTS (SELECT 1 FROM public.employees WHERE email LIKE '%@mock.profina.test') THEN
    RAISE NOTICE 'Mock data already present - nothing to do (run mock-data-reset.sql first).';
    RETURN;
  END IF;

  SELECT r.user_id INTO v_admin_user FROM public.user_roles r
   WHERE r.role = 'admin' AND r.revoked_at IS NULL ORDER BY r.granted_at LIMIT 1;
  SELECT e.id INTO v_admin_emp FROM public.employees e WHERE e.user_id = v_admin_user;

  first_ascii := ARRAY(SELECT lower(translate(x, 'äöüÄÖÜß', 'aouAOUs')) FROM unnest(first_names) x);
  last_ascii  := ARRAY(SELECT replace(replace(replace(replace(lower(x), 'ä', 'ae'), 'ö', 'oe'), 'ü', 'ue'), 'ß', 'ss')
                         FROM unnest(last_names) x);

  -- The signed-in admin heads the structure (needs a level for career views).
  IF v_admin_emp IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.career_level_history WHERE employee_id = v_admin_emp) THEN
    INSERT INTO public.career_level_history (employee_id, level_code, effective_from, source, reason)
    SELECT id, 'VD', start_date, 'initial', 'Mock-Daten: Startstufe' FROM public.employees WHERE id = v_admin_emp;
  END IF;
  IF v_admin_emp IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.hierarchy_assignments WHERE employee_id = v_admin_emp) THEN
    INSERT INTO public.hierarchy_assignments (employee_id, manager_id, effective_from, change_reason)
    SELECT id, NULL, start_date, 'Mock-Daten: Strukturspitze' FROM public.employees WHERE id = v_admin_emp;
  END IF;

  -- ---------- Employees, invites, auth users ----------
  FOR i IN 1..50 LOOP
    v_level := CASE
      WHEN i = 1 THEN 'VD' WHEN i <= 3 THEN 'RL' WHEN i <= 6 THEN 'DL' WHEN i <= 11 THEN 'OL'
      WHEN i <= 20 THEN 'TL' WHEN i <= 35 THEN 'FB' ELSE 'FA' END;
    lvl := lvl || v_level;
    mgr := mgr || CASE
      WHEN i = 1 THEN 0
      WHEN i <= 3 THEN 1
      WHEN i <= 6 THEN 2 + (i % 2)
      WHEN i <= 11 THEN 4 + (i % 3)
      WHEN i <= 20 THEN 7 + (i % 5)
      WHEN i <= 35 THEN 12 + (i % 9)
      ELSE CASE WHEN i % 3 = 0 THEN 12 + (i % 9) ELSE 21 + (i % 15) END END;

    v_status := CASE WHEN i BETWEEN 44 AND 46 THEN 'inactive' WHEN i >= 47 THEN 'invited' ELSE 'active' END;
    v_start := CASE WHEN i >= 47 THEN DATE '2026-10-12' + (i - 47) * 10
                    ELSE DATE '2025-02-03' + (i - 1) * 11 END;
    start := start || v_start;
    v_email := first_ascii[i] || '.' || last_ascii[i] || '@mock.profina.test';

    INSERT INTO public.employees (first_name, last_name, email, phone, start_date, status, employment_type, created_by)
    VALUES (first_names[i], last_names[i], v_email,
            CASE WHEN i % 4 = 0 THEN NULL ELSE '+49' || (1510000000 + i * 104729)::text END,
            v_start, 'invited', CASE WHEN i % 7 = 0 THEN 'part_time' ELSE 'full_time' END, v_admin_user)
    RETURNING id INTO v_id;
    emp := emp || v_id;

    INSERT INTO public.employee_invites (employee_id, email, invited_by, created_at, expires_at)
    VALUES (v_id, v_email, v_admin_user,
            CASE WHEN i = 50 THEN now() - interval '10 days' ELSE now() - interval '1 day' END,
            CASE WHEN i = 50 THEN now() - interval '3 days' ELSE now() + interval '7 days' END);

    IF v_status = 'invited' THEN
      usr := usr || NULL::uuid;
      CONTINUE;
    END IF;

    -- Real flow: auth user links the employee, confirming activates it.
    INSERT INTO auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
                            created_at, updated_at, confirmation_token, recovery_token,
                            email_change_token_new, email_change, email_change_token_current,
                            reauthentication_token, phone_change, phone_change_token)
    VALUES ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', v_email,
            '{"provider":"email","providers":["email"]}', '{}', v_start, v_start,
            '', '', '', '', '', '', '', '')
    RETURNING id INTO v_user;
    UPDATE auth.users SET email_confirmed_at = v_start + time '09:00',
                          last_sign_in_at = CASE WHEN i % 5 = 0 THEN NULL ELSE now() - (i || ' hours')::interval END
     WHERE id = v_user;
    usr := usr || v_user;

    UPDATE public.employee_invites
       SET created_at = v_start - 3, expires_at = v_start + 4,
           linked_at = v_start + time '08:00', accepted_at = v_start + time '09:00'
     WHERE employee_id = v_id;

    IF v_status = 'inactive' THEN
      v_deact := DATE '2026-09-30' + (i - 44) * 9;
      UPDATE public.employees SET status = 'inactive', deactivated_at = v_deact + time '17:00' WHERE id = v_id;
    END IF;
  END LOOP;

  -- ---------- Career levels (some reached by promotion) ----------
  FOR i IN 1..50 LOOP
    k := array_position(ladder, lvl[i]);
    IF lvl[i] <> 'FA' AND i % 3 <> 0 AND start[i] < DATE '2026-03-01' THEN
      v_prev := ladder[k - 1];
      INSERT INTO public.career_level_history (employee_id, level_code, effective_from, source, reason, approved_by)
      VALUES (emp[i], v_prev, start[i], 'initial', 'Startstufe bei Eintritt', v_admin_user);
      INSERT INTO public.career_level_history (employee_id, level_code, effective_from, source, reason, evidence, approved_by)
      VALUES (emp[i], lvl[i], least(start[i] + 200, DATE '2026-09-01'), 'promotion',
              'Qualifikation erreicht (Mock-Daten)', '{"mock": true}', v_admin_user);
    ELSE
      INSERT INTO public.career_level_history (employee_id, level_code, effective_from, source, reason, approved_by)
      VALUES (emp[i], lvl[i], start[i], 'initial', 'Startstufe bei Eintritt', v_admin_user);
    END IF;
  END LOOP;
  -- One manual correction for the history view.
  INSERT INTO public.career_level_history (employee_id, level_code, effective_from, source, reason, approved_by)
  VALUES (emp[30], 'FB', DATE '2026-06-15', 'admin_correction', 'Stufe nach Prüfung der Unterlagen korrigiert', v_admin_user);

  -- ---------- Roles ----------
  INSERT INTO public.user_roles (user_id, role, granted_by) VALUES
    (usr[5],  'finance',    v_admin_user),
    (usr[9],  'finance',    v_admin_user),
    (usr[14], 'compliance', v_admin_user),
    (usr[2],  'admin',      v_admin_user);
  INSERT INTO public.user_roles (user_id, role, granted_by, granted_at, revoked_at, revoked_by) VALUES
    (usr[18], 'compliance', v_admin_user, now() - interval '90 days', now() - interval '20 days', v_admin_user);

  -- ---------- Hierarchy ----------
  FOR i IN 1..50 LOOP
    v_end := CASE WHEN i BETWEEN 44 AND 46 THEN DATE '2026-09-30' + (i - 44) * 9 + 1 END;
    IF i = 1 THEN
      -- Mock top: independent until it joins the admin's structure.
      IF v_admin_emp IS NOT NULL THEN
        INSERT INTO public.hierarchy_assignments (employee_id, manager_id, effective_from, effective_to, change_reason, approved_by)
        VALUES (emp[1], NULL, start[1], DATE '2026-10-26', 'Eintritt', v_admin_user),
               (emp[1], v_admin_emp, DATE '2026-10-26', NULL, 'Übernahme in die Gesamtstruktur', v_admin_user);
      ELSE
        INSERT INTO public.hierarchy_assignments (employee_id, manager_id, effective_from, change_reason)
        VALUES (emp[1], NULL, start[1], 'Eintritt');
      END IF;
    ELSIF i IN (15, 23, 29, 39) THEN
      -- History: moved to another manager in spring.
      n := CASE WHEN mgr[i] = 1 THEN 2 ELSE mgr[mgr[i]] END;
      INSERT INTO public.hierarchy_assignments (employee_id, manager_id, effective_from, effective_to, change_reason, approved_by)
      VALUES (emp[i], emp[n], start[i], DATE '2026-04-01', 'Eintritt', v_admin_user),
             (emp[i], emp[mgr[i]], DATE '2026-04-01', NULL, 'Wechsel in neues Team', v_admin_user);
    ELSIF i IN (26, 41) THEN
      -- Planned change in the future (cancellable in the Hierarchie tab).
      INSERT INTO public.hierarchy_assignments (employee_id, manager_id, effective_from, effective_to, change_reason, approved_by)
      VALUES (emp[i], emp[mgr[i]], start[i], DATE '2026-12-01', 'Eintritt', v_admin_user),
             (emp[i], emp[12], DATE '2026-12-01', NULL, 'Geplanter Teamwechsel zum Jahresende', v_admin_user);
    ELSE
      INSERT INTO public.hierarchy_assignments (employee_id, manager_id, effective_from, effective_to, change_reason, approved_by)
      VALUES (emp[i], emp[mgr[i]], start[i], v_end, 'Eintritt', v_admin_user);
    END IF;
  END LOOP;

  -- ---------- Production + point calculations ----------
  FOR i IN 1..46 LOOP
    v_start := greatest(start[i], DATE '2026-01-02');
    v_end := CASE WHEN i BETWEEN 44 AND 46 THEN DATE '2026-09-30' + (i - 44) * 9 ELSE app_private.business_today() END;
    IF v_start >= v_end THEN CONTINUE; END IF;
    n := 3 + floor(random() * 10)::int + CASE WHEN i = ANY (stars) THEN 14 ELSE 0 END;
    FOR k IN 1..n LOOP
      v_cat := cats[1 + floor(random() * array_length(cats, 1))::int];
      -- Stars produce mostly KV/LV in the last weeks (promotion-ready).
      IF i = ANY (stars) AND k > n - 14 THEN
        v_cat := CASE WHEN k % 2 = 0 THEN 'KV' ELSE 'LV' END;
        v_date := greatest(v_start, v_end - 45) + floor(random() * least(45, v_end - v_start))::int;
      ELSE
        v_date := v_start + floor(random() * (v_end - v_start))::int;
      END IF;
      v_period := CASE v_cat WHEN 'SACH' THEN 'annual' WHEN 'KFZ' THEN 'annual' WHEN 'STROM' THEN 'annual'
                             WHEN 'GAS' THEN 'annual' ELSE 'monthly' END;
      v_amount := round((CASE v_cat WHEN 'KV' THEN 120 + random() * 380 WHEN 'LV' THEN 50 + random() * 200
                                    WHEN 'SACH' THEN 300 + random() * 1500 WHEN 'KFZ' THEN 350 + random() * 900
                                    ELSE 600 + random() * 1400 END)::numeric, 2);
      v_net := CASE WHEN v_cat = 'SACH' THEN 'net' END;
      v_term := CASE WHEN v_cat = 'LV' THEN 12 + floor(random() * 28) END;
      -- Mostly eligible, the rest spread over the other states.
      v_kind := CASE WHEN v_date > v_end - 10 AND random() < 0.5 THEN 'submitted'
                     WHEN random() < 0.06 THEN 'draft'
                     WHEN random() < 0.06 THEN 'cancelled'
                     ELSE 'eligible' END;
      IF i = ANY (stars) AND k > n - 14 THEN v_kind := 'eligible'; END IF;

      INSERT INTO public.production_records
        (producer_id, category_code, product_reference, premium_amount, premium_period, net_or_gross,
         term_years, production_date, status, source, notes, created_by, created_at)
      VALUES (emp[i], v_cat, 'MOCK-' || to_char(v_date, 'YYMMDD') || '-' || lpad((i * 100 + k)::text, 5, '0'),
              v_amount, v_period, v_net, v_term, v_date,
              CASE WHEN v_kind = 'draft' THEN 'draft' ELSE 'submitted' END, 'manual',
              CASE WHEN k % 6 = 0 THEN 'Abschluss nach Beratungstermin vor Ort.' END,
              usr[i], v_date + time '10:00')
      RETURNING id INTO v_pid;

      IF v_kind IN ('eligible', 'cancelled') THEN
        PERFORM app_private.write_original_calculation(v_pid, 'Als anrechenbar markiert');
        UPDATE public.production_records SET status = 'eligible', eligible_at = v_date + time '16:00' WHERE id = v_pid;
      END IF;
      IF v_kind = 'cancelled' THEN
        PERFORM app_private.reverse_open_calculation(v_pid, 'Storno durch Kunden');
        UPDATE public.production_records SET status = 'cancelled', cancelled_at = v_date + 20 WHERE id = v_pid;
      END IF;
    END LOOP;
  END LOOP;

  -- Career periods (the career views expect them).
  FOR i IN 1..50 LOOP
    PERFORM app_private.generate_periods(emp[i]);
  END LOOP;

  -- ---------- Lead sources + monthly costs ----------
  INSERT INTO public.lead_sources (name, kind, active) VALUES
    ('Messe Finanzforum', 'campaign', true),
    ('Social Media', 'campaign', true),
    ('Partnerbüro Nord', 'referral', true),
    ('Vergleichsportal', 'other', true),
    ('Altkampagne 2025', 'campaign', false)
  ON CONFLICT (name) DO NOTHING;

  INSERT INTO public.lead_source_costs (source_id, month, amount, note)
  SELECT s.id, m::date,
         round((CASE s.kind WHEN 'campaign' THEN 800 + random() * 2400 WHEN 'website' THEN 300 + random() * 900
                            WHEN 'other' THEN 500 + random() * 1500 ELSE 50 + random() * 300 END)::numeric, 2),
         CASE WHEN random() < 0.2 THEN 'Rechnung liegt vor' END
    FROM public.lead_sources s
   CROSS JOIN generate_series(DATE '2025-12-01', DATE '2026-11-01', interval '1 month') m
   WHERE s.kind <> 'own'
  ON CONFLICT DO NOTHING;
END
$$;

-- ============================================================
-- Leads, customers, tasks, activities, notifications.
-- Every mock lead/customer has an @mock-kunde.test address (the reset
-- script finds everything through those and the mock employees).
-- ============================================================
DO $$
DECLARE
  v_admin_emp uuid;
  owners uuid[];
  first_names text[] := ARRAY[
    'Andrea','Bernd','Claudia','Dieter','Elke','Frank','Gabriele','Heiko','Ines','Jürgen',
    'Karin','Lars','Monika','Norbert','Olga','Peter','Renate','Sven','Tanja','Uwe',
    'Verena','Wolfgang','Yvonne','Zoe','Ali','Elif','Mehmet','Ayşe','Piotr','Agnieszka',
    'Marco','Giulia','Nikolai','Svetlana','Henrik','Frieda','Oskar','Ida','Emil','Greta'];
  last_names text[] := ARRAY[
    'Albrecht','Bauer','Conrad','Dietrich','Engel','Franke','Graf','Haas','Ernst','Jäger',
    'Kühn','Lorenz','Marx','Nagel','Otto','Pohl','Ritter','Sommer','Thiel','Ullrich',
    'Vogt','Winkler','Yilmaz','Ziegler','Kaya','Demir','Nowak','Kowalski','Rossi','Popov',
    'Brandt','Haase','Schuster','Böhm','Arnold','Seidel','Beck','Pfeiffer','Busch','Kraus'];
  companies text[] := ARRAY['Bäckerei Sonnenschein GmbH','Elektro Kraus KG','Praxis Dr. Lorenz',
    'Autohaus Nagel','Café am Markt','Steuerbüro Thiel','Malerbetrieb Seidel','Gärtnerei Winkler'];
  cities text[] := ARRAY['Berlin','Hamburg','München','Köln','Frankfurt am Main','Stuttgart','Düsseldorf',
    'Leipzig','Dortmund','Essen','Bremen','Dresden','Hannover','Nürnberg','Mainz','Freiburg'];
  zips text[] := ARRAY['10115','20095','80331','50667','60311','70173','40213',
    '04109','44135','45127','28195','01067','30159','90402','55116','79098'];
  streets text[] := ARRAY['Hauptstraße','Bahnhofstraße','Gartenweg','Lindenallee','Schillerstraße',
    'Goethestraße','Bergstraße','Kirchplatz','Am Markt','Rosenweg'];
  cats text[] := ARRAY['KV','LV','SACH','KFZ','STROM','GAS'];
  stage_pool text[] := ARRAY['new','new','assigned','assigned','contact_attempted','contact_attempted',
    'contact_attempted','contacted','contacted','contacted','qualified','qualified',
    'appointment_booked','appointment_booked','appointment_held','appointment_held','offer','offer',
    'won','won','won','won','lost','lost','lost','nurture','nurture'];
  open_path text[] := ARRAY['new','assigned','contact_attempted','contacted','qualified',
    'appointment_booked','appointment_held','offer'];
  next_actions text[] := ARRAY['Rückruf vereinbaren','Unterlagen anfordern','Angebot nachfassen',
    'Beratungstermin bestätigen','Bedarfsanalyse vorbereiten','Vergleichsrechnung schicken'];
  loss_reasons text[] := ARRAY['no_interest','not_reachable','price','competitor','no_need','not_eligible','other'];
  task_titles text[] := ARRAY['Wochenplanung erstellen','Provisionsabrechnung prüfen','Teammeeting vorbereiten',
    'Schulungsunterlagen lesen','Empfehlungsgeber anrufen','Kundenportfolio durchsehen',
    'CRM-Notizen nachtragen','Quartalsziele besprechen','Messeauftritt vorbereiten','Bestandskunden-Mailing freigeben'];
  sources uuid[];
  i int; k int; n int;
  v_stage text; v_path text[]; v_owner uuid; v_mgr uuid; v_fn text; v_ln text; v_company text;
  v_email text; v_received timestamptz; v_step interval; v_t timestamptz; v_first timestamptz;
  v_lead uuid; v_cust uuid; v_ci int; v_status text; v_created timestamptz; v_due date;
  v_interest text[]; v_next_at timestamptz; v_prio text;
BEGIN
  IF EXISTS (SELECT 1 FROM public.leads WHERE email LIKE '%@mock-kunde.test') THEN
    RAISE NOTICE 'Mock leads already present - skipping leads/customers/tasks.';
    RETURN;
  END IF;

  SELECT e.id INTO v_admin_emp FROM public.employees e
    JOIN public.user_roles r ON r.user_id = e.user_id AND r.role = 'admin' AND r.revoked_at IS NULL
   WHERE e.email NOT LIKE '%@mock.profina.test' ORDER BY r.granted_at LIMIT 1;
  owners := ARRAY(SELECT id FROM public.employees WHERE status = 'active' AND email LIKE '%@mock.profina.test' ORDER BY employee_no);
  IF v_admin_emp IS NOT NULL THEN owners := owners || v_admin_emp; END IF;
  sources := ARRAY(SELECT id FROM public.lead_sources WHERE active ORDER BY name);

  -- ---------- Leads (+ customers for won leads) ----------
  FOR i IN 1..180 LOOP
    v_stage := stage_pool[1 + floor(random() * array_length(stage_pool, 1))::int];
    v_path := CASE v_stage
      WHEN 'won' THEN ARRAY['new','assigned','contacted','qualified','appointment_booked','appointment_held','offer','won']
      WHEN 'lost' THEN open_path[1:2 + floor(random() * 6)::int] || 'lost'::text
      WHEN 'nurture' THEN ARRAY['new','assigned','contacted','nurture']
      ELSE open_path[1:array_position(open_path, v_stage)] END;
    n := array_length(v_path, 1);

    -- The admin gets a fair share so "Meine Leads" is not empty.
    v_owner := CASE WHEN v_stage = 'new' THEN NULL
                    WHEN i % 6 = 0 AND v_admin_emp IS NOT NULL THEN v_admin_emp
                    ELSE owners[1 + floor(random() * array_length(owners, 1))::int] END;
    SELECT a.manager_id INTO v_mgr FROM public.hierarchy_assignments a
     WHERE a.employee_id = v_owner AND a.effective_from <= current_date
       AND (a.effective_to IS NULL OR a.effective_to > current_date) LIMIT 1;
    v_mgr := coalesce(v_mgr, v_admin_emp);

    v_fn := first_names[1 + floor(random() * 40)::int];
    v_ln := last_names[1 + floor(random() * 40)::int];
    v_company := CASE WHEN random() < 0.1 THEN companies[1 + floor(random() * 8)::int] END;
    v_email := lower(translate(v_fn || '.' || v_ln, 'äöüÄÖÜßş', 'aouAOUss')) || i || '@mock-kunde.test';
    v_received := now() - CASE WHEN v_stage IN ('new', 'assigned') THEN random() * interval '3 days'
                               ELSE interval '5 days' + random() * interval '115 days' END;
    v_step := (now() - interval '2 hours' - v_received) * (0.4 + random() * 0.5) / greatest(n - 1, 1);
    v_first := CASE WHEN array_position(v_path, 'contact_attempted') IS NOT NULL
                      OR array_position(v_path, 'contacted') IS NOT NULL
                    THEN v_received + v_step * 2 END;
    v_interest := CASE WHEN n >= 4 OR random() < 0.5
                       THEN ARRAY(SELECT DISTINCT cats[1 + floor(random() * 6)::int] FROM generate_series(1, 1 + floor(random() * 2)::int))
                       ELSE '{}' END;
    v_prio := CASE WHEN random() < 0.2 THEN 'high' WHEN random() < 0.25 THEN 'low' ELSE 'normal' END;
    v_next_at := CASE
      WHEN v_stage = 'nurture' THEN now() + interval '30 days' + random() * interval '60 days'
      WHEN v_stage = 'appointment_booked' THEN date_trunc('hour', now() + interval '1 day' + random() * interval '9 days')
      WHEN v_stage IN ('new', 'won', 'lost') THEN NULL
      ELSE date_trunc('hour', now() + (random() * 10 - 3) * interval '1 day') END;

    v_cust := NULL;
    IF v_stage = 'won' THEN
      v_ci := 1 + floor(random() * 16)::int;
      INSERT INTO public.customers (first_name, last_name, company, phone, email, street, postal_code, city,
                                    preferred_channel, owner_id, status, created_by, created_at, notes)
      VALUES (v_fn, v_ln, v_company, '+4917' || (10000000 + floor(random() * 89999999))::text, v_email,
              streets[1 + floor(random() * 10)::int] || ' ' || (1 + floor(random() * 120))::text, zips[v_ci], cities[v_ci],
              'phone', v_owner, 'active', v_owner, v_received + v_step * (n - 1), 'Aus Lead gewonnen.')
      RETURNING id INTO v_cust;
    END IF;

    INSERT INTO public.leads (first_name, last_name, company, phone, email, preferred_channel, source_id,
                              campaign, referral, received_at, owner_id, assigned_by, assigned_at, created_by,
                              product_interest, region, priority, consent_basis, notes, stage, stage_entered_at,
                              next_action, next_action_at, first_contact_at, sla_due_at, loss_reason, closed_at,
                              customer_id, created_at)
    VALUES (v_fn, v_ln, v_company,
            CASE WHEN random() < 0.85 THEN '+4916' || (10000000 + floor(random() * 89999999))::text END,
            v_email, (ARRAY['any','phone','email','whatsapp','in_person'])[1 + floor(random() * 5)::int],
            sources[1 + floor(random() * array_length(sources, 1))::int],
            CASE WHEN random() < 0.3 THEN 'Herbstaktion 2026' END,
            CASE WHEN random() < 0.15 THEN 'Empfohlen von ' || first_names[1 + floor(random() * 40)::int] END,
            v_received, v_owner, CASE WHEN v_owner IS NOT NULL THEN v_mgr END,
            CASE WHEN v_owner IS NOT NULL THEN v_received + v_step END,
            coalesce(v_mgr, v_admin_emp), v_interest, cities[1 + floor(random() * 16)::int], v_prio,
            CASE WHEN n >= 4 THEN 'consent' END,
            CASE WHEN random() < 0.3 THEN 'Interessiert an einer Absicherung für die Familie. Bevorzugt Termine am Abend.' END,
            v_stage, v_received + v_step * (n - 1),
            CASE WHEN v_next_at IS NOT NULL THEN
              CASE WHEN v_stage = 'appointment_booked' THEN 'Beratungstermin wahrnehmen'
                   WHEN v_stage = 'nurture' THEN 'In drei Monaten erneut anrufen'
                   ELSE next_actions[1 + floor(random() * 6)::int] END END,
            v_next_at, v_first, v_received + interval '8 hours',
            CASE WHEN v_stage = 'lost' THEN loss_reasons[1 + floor(random() * 7)::int] END,
            CASE WHEN v_stage IN ('won', 'lost') THEN v_received + v_step * (n - 1) END,
            v_cust, v_received)
    RETURNING id INTO v_lead;
    IF v_cust IS NOT NULL THEN UPDATE public.customers SET lead_id = v_lead WHERE id = v_cust; END IF;

    -- Stage history along the path, assignment, activities.
    FOR k IN 1..n LOOP
      v_t := v_received + v_step * (k - 1);
      INSERT INTO public.lead_stage_history (lead_id, from_stage, to_stage, changed_by, automatic, changed_at)
      VALUES (v_lead, CASE WHEN k > 1 THEN v_path[k - 1] END, v_path[k],
              CASE WHEN k = 1 THEN NULL WHEN v_path[k] = 'assigned' THEN v_mgr ELSE v_owner END,
              k = 1 OR v_path[k] IN ('contact_attempted', 'contacted', 'appointment_booked', 'appointment_held'), v_t);
      IF v_owner IS NULL THEN CONTINUE; END IF;
      IF v_path[k] = 'assigned' THEN
        INSERT INTO public.lead_assignments (lead_id, from_owner, to_owner, assigned_by, reason, assigned_at)
        VALUES (v_lead, NULL, v_owner, v_mgr, 'Zuweisung aus dem Lead-Pool', v_t);
      ELSIF v_path[k] IN ('contact_attempted', 'contacted') THEN
        INSERT INTO public.activities (owner_id, type, linked_type, linked_id, occurred_at, outcome, notes, created_by, created_at)
        VALUES (v_owner, 'contact_attempt', 'lead', v_lead, v_t,
                CASE WHEN v_path[k] = 'contacted' THEN 'reached' ELSE 'not_reached' END,
                CASE WHEN v_path[k] = 'contacted' THEN 'Erstgespräch geführt, Interesse vorhanden.' ELSE 'Mailbox, Rückruf erbeten.' END,
                v_owner, v_t);
      ELSIF v_path[k] = 'qualified' THEN
        INSERT INTO public.activities (owner_id, type, linked_type, linked_id, occurred_at, notes, created_by, created_at)
        VALUES (v_owner, 'call', 'lead', v_lead, v_t, 'Bedarf aufgenommen, Unterlagen angefordert.', v_owner, v_t);
      ELSIF v_path[k] = 'appointment_booked' AND k = n THEN
        INSERT INTO public.activities (owner_id, type, linked_type, linked_id, occurred_at, scheduled_at, notes, created_by, created_at)
        VALUES (v_owner, 'appointment', 'lead', v_lead, v_t, v_next_at, 'Beratung vor Ort.', v_owner, v_t);
      ELSIF v_path[k] = 'appointment_held' THEN
        INSERT INTO public.activities (owner_id, type, linked_type, linked_id, occurred_at, scheduled_at, outcome, notes, created_by, created_at)
        VALUES (v_owner, 'appointment', 'lead', v_lead, v_t, v_t, 'held', 'Termin hat stattgefunden.', v_owner, v_t);
      ELSIF v_path[k] = 'offer' THEN
        INSERT INTO public.activities (owner_id, type, linked_type, linked_id, occurred_at, notes, created_by, created_at)
        VALUES (v_owner, 'offer', 'lead', v_lead, v_t, 'Angebot per E-Mail versendet.', v_owner, v_t);
      ELSIF v_path[k] IN ('won', 'lost', 'nurture') THEN
        INSERT INTO public.activities (owner_id, type, linked_type, linked_id, occurred_at, notes, created_by, created_at)
        VALUES (v_owner, 'note', 'lead', v_lead, v_t,
                CASE v_path[k] WHEN 'won' THEN 'Vertrag unterschrieben.' WHEN 'lost' THEN 'Lead abgeschlossen.'
                                ELSE 'Aktuell kein Bedarf, später erneut melden.' END, v_owner, v_t);
      END IF;
    END LOOP;

    -- Tasks generated from the lead.
    IF v_owner IS NULL AND v_admin_emp IS NOT NULL THEN
      INSERT INTO public.tasks (owner_id, source, type, title, linked_type, linked_id, due_at, priority, created_at)
      VALUES (v_admin_emp, 'system', 'lead_unassigned', 'Lead zuweisen: ' || v_fn || ' ' || v_ln, 'lead', v_lead,
              v_received + interval '4 hours', 'high', v_received);
    ELSIF v_stage = 'assigned' THEN
      INSERT INTO public.tasks (owner_id, source, type, title, linked_type, linked_id, due_at, priority, created_at)
      VALUES (v_owner, 'system', 'lead_first_contact', 'Erstkontakt: ' || v_fn || ' ' || v_ln, 'lead', v_lead,
              v_received + interval '8 hours', 'high', v_received + v_step);
    ELSIF v_next_at IS NOT NULL THEN
      INSERT INTO public.tasks (owner_id, source, type, title, linked_type, linked_id, due_at, priority, created_at)
      VALUES (v_owner, 'system', 'lead_next_action',
              (SELECT next_action FROM public.leads WHERE id = v_lead) || ': ' || v_fn || ' ' || v_ln,
              'lead', v_lead, v_next_at, v_prio, v_received + v_step * (n - 1));
    END IF;
  END LOOP;

  -- ---------- Customers ----------
  FOR i IN 1..95 LOOP
    v_owner := CASE WHEN i % 5 = 0 AND v_admin_emp IS NOT NULL THEN v_admin_emp
                    ELSE owners[1 + floor(random() * array_length(owners, 1))::int] END;
    v_fn := first_names[1 + floor(random() * 40)::int];
    v_ln := last_names[1 + floor(random() * 40)::int];
    v_ci := 1 + floor(random() * 16)::int;
    v_created := now() - interval '10 days' - random() * interval '700 days';
    v_status := CASE WHEN random() < 0.12 THEN 'prospect' WHEN random() < 0.8 THEN 'active'
                     WHEN random() < 0.55 THEN 'inactive' ELSE 'former' END;
    INSERT INTO public.customers (first_name, last_name, company, preferred_name, date_of_birth, phone, email,
                                  street, postal_code, city, preferred_channel, owner_id, status,
                                  next_follow_up_at, notes, created_by, created_at)
    VALUES (v_fn, v_ln, CASE WHEN i % 11 = 0 THEN companies[1 + floor(random() * 8)::int] END,
            CASE WHEN i % 13 = 0 THEN left(v_fn, 3) END,
            CASE WHEN random() < 0.85 THEN DATE '1950-01-01' + floor(random() * 19000)::int END,
            CASE WHEN random() < 0.9 THEN '+4917' || (10000000 + floor(random() * 89999999))::text END,
            lower(translate(v_fn || '.' || v_ln, 'äöüÄÖÜßş', 'aouAOUss')) || '.k' || i || '@mock-kunde.test',
            streets[1 + floor(random() * 10)::int] || ' ' || (1 + floor(random() * 120))::text, zips[v_ci], cities[v_ci],
            (ARRAY['any','phone','email','whatsapp','in_person','letter'])[1 + floor(random() * 6)::int],
            v_owner, v_status,
            CASE WHEN random() < 0.35 THEN date_trunc('hour', now() + (random() * 40 - 10) * interval '1 day') END,
            CASE WHEN random() < 0.4 THEN (ARRAY['Hat zwei Kinder, plant Hauskauf.','Bevorzugt Kontakt nach 18 Uhr.',
                                                 'Selbstständig seit 2021.','Interesse an Altersvorsorge.'])[1 + floor(random() * 4)::int] END,
            v_owner, v_created);
  END LOOP;

  -- Consents, assignments, service items, activities and tasks for every mock customer.
  FOR v_cust, v_owner, v_created, v_status IN
    SELECT id, owner_id, created_at, status FROM public.customers WHERE email LIKE '%@mock-kunde.test'
  LOOP
    INSERT INTO public.customer_assignments (customer_id, from_owner, to_owner, assigned_by, reason, assigned_at)
    VALUES (v_cust, NULL, v_owner, v_owner, 'Kunde angelegt', v_created);
    IF random() < 0.1 THEN
      INSERT INTO public.customer_assignments (customer_id, from_owner, to_owner, assigned_by, reason, assigned_at)
      VALUES (v_cust, owners[1 + floor(random() * array_length(owners, 1))::int], v_owner, v_admin_emp,
              'Bestandsübertragung nach Teamwechsel', v_created + (now() - v_created) / 2);
    END IF;

    INSERT INTO public.customer_consents (customer_id, purpose, action, legal_basis, source, evidence, effective_at, recorded_by, recorded_at)
    VALUES (v_cust, 'contact_phone', 'granted', 'contract', 'in_person', 'Beratungsprotokoll', v_created, v_owner, v_created);
    IF random() < 0.8 THEN
      INSERT INTO public.customer_consents (customer_id, purpose, action, legal_basis, source, evidence, effective_at, recorded_by, recorded_at)
      VALUES (v_cust, 'contact_email', 'granted', 'consent', 'form', 'Einwilligungsformular', v_created, v_owner, v_created);
    END IF;
    IF random() < 0.4 THEN
      INSERT INTO public.customer_consents (customer_id, purpose, action, legal_basis, source, effective_at, recorded_by, recorded_at)
      VALUES (v_cust, 'marketing_email', 'granted', 'consent', 'form', v_created + interval '1 day', v_owner, v_created + interval '1 day');
      IF random() < 0.25 THEN
        INSERT INTO public.customer_consents (customer_id, purpose, action, source, evidence, effective_at, recorded_by, recorded_at)
        VALUES (v_cust, 'marketing_email', 'withdrawn', 'email', 'Abmeldung per E-Mail', now() - interval '12 days', v_owner, now() - interval '12 days');
      END IF;
    END IF;
    IF random() < 0.3 THEN
      INSERT INTO public.customer_consents (customer_id, purpose, action, legal_basis, source, effective_at, recorded_by, recorded_at)
      VALUES (v_cust, 'birthday_email', 'granted', 'consent', 'in_person', v_created, v_owner, v_created);
    END IF;
    IF random() < 0.04 THEN
      INSERT INTO public.customer_consents (customer_id, purpose, action, source, evidence, effective_at, recorded_by, recorded_at)
      VALUES (v_cust, 'all', 'opt_out', 'letter', 'Widerspruch per Brief', now() - interval '30 days', v_owner, now() - interval '30 days');
    END IF;

    IF v_status IN ('active', 'prospect') AND random() < 0.75 THEN
      k := 1 + floor(random() * 4)::int;
      v_due := current_date + floor(random() * 150 - 60)::int;
      v_status := CASE WHEN v_due < current_date - 7 AND random() < 0.7 THEN 'done'
                       WHEN random() < 0.05 THEN 'cancelled' ELSE 'open' END;
      INSERT INTO public.customer_service_items (customer_id, kind, title, due_on, owner_id, recurrence, status, note,
                                                 completed_at, completed_by, created_by, created_at)
      VALUES (v_cust, (ARRAY['annual_review','pending_documents','follow_up_after_advice','other'])[k],
              (ARRAY['Jahresgespräch','Unterlagen nachreichen: Gehaltsnachweis','Nachfassen nach Beratung','Adressänderung prüfen'])[k],
              v_due, v_owner, CASE WHEN k = 1 THEN 'yearly' ELSE 'none' END, v_status,
              CASE WHEN random() < 0.3 THEN 'Kunde wünscht Termin per Video.' END,
              CASE WHEN v_status <> 'open' THEN v_due + time '15:00' END,
              CASE WHEN v_status <> 'open' THEN v_owner END, v_owner, v_created);
      IF v_status = 'open' THEN
        INSERT INTO public.tasks (owner_id, source, type, title, linked_type, linked_id, due_at, priority, created_at)
        VALUES (v_owner, 'system', 'customer_service',
                (ARRAY['Jahresgespräch','Unterlagen nachreichen','Nachfassen nach Beratung','Adressänderung prüfen'])[k] || ': '
                  || (SELECT coalesce(company, first_name || ' ' || last_name) FROM public.customers WHERE id = v_cust),
                'customer', v_cust, v_due + time '09:00', 'normal', v_created);
      END IF;
    END IF;

    FOR k IN 1..floor(random() * 4)::int LOOP
      v_t := v_created + random() * (now() - v_created);
      n := floor(random() * 4)::int;
      INSERT INTO public.activities (owner_id, type, linked_type, linked_id, occurred_at, scheduled_at, outcome, notes, created_by, created_at)
      VALUES (v_owner, (ARRAY['call','email','note','appointment'])[n + 1], 'customer', v_cust, v_t,
              CASE WHEN n = 3 THEN v_t END, CASE WHEN n = 3 THEN 'held' END,
              (ARRAY['Kurz telefoniert, alles in Ordnung.','Unterlagen per E-Mail geschickt.',
                     'Adresse aktualisiert.','Jahresgespräch geführt.'])[n + 1], v_owner, v_t);
    END LOOP;
  END LOOP;

  INSERT INTO public.tasks (owner_id, source, type, title, linked_type, linked_id, due_at, priority, created_at)
  SELECT owner_id, 'system', 'customer_follow_up',
         'Wiedervorlage: ' || coalesce(company, first_name || ' ' || last_name), 'customer', id,
         next_follow_up_at, 'normal', created_at
    FROM public.customers WHERE email LIKE '%@mock-kunde.test' AND next_follow_up_at IS NOT NULL;

  -- ---------- Manual tasks (linked, so the reset finds the admin's too) ----------
  FOR i IN 1..70 LOOP
    v_owner := CASE WHEN i % 4 = 0 AND v_admin_emp IS NOT NULL THEN v_admin_emp
                    ELSE owners[1 + floor(random() * array_length(owners, 1))::int] END;
    SELECT id INTO v_cust FROM public.customers
     WHERE email LIKE '%@mock-kunde.test' AND owner_id = v_owner ORDER BY random() LIMIT 1;
    IF v_cust IS NULL THEN
      SELECT id INTO v_cust FROM public.customers WHERE email LIKE '%@mock-kunde.test' ORDER BY random() LIMIT 1;
    END IF;
    v_t := date_trunc('hour', now() + (random() * 24 - 10) * interval '1 day');
    v_status := CASE WHEN v_t < now() AND random() < 0.6 THEN 'done' WHEN random() < 0.05 THEN 'cancelled' ELSE 'open' END;
    INSERT INTO public.tasks (owner_id, created_by, source, type, title, description, linked_type, linked_id, due_at,
                              priority, status, completed_at, completion_note, created_at)
    VALUES (v_owner, v_owner, 'manual', 'manual', task_titles[1 + floor(random() * 10)::int],
            CASE WHEN random() < 0.4 THEN 'Bitte bis Ende der Woche erledigen und kurz im Team-Chat melden.' END,
            'customer', v_cust, CASE WHEN random() < 0.9 THEN v_t END,
            CASE WHEN random() < 0.2 THEN 'high' WHEN random() < 0.3 THEN 'low' ELSE 'normal' END,
            v_status, CASE WHEN v_status <> 'open' THEN least(v_t, now()) END,
            CASE WHEN v_status = 'done' AND random() < 0.4 THEN 'Erledigt.' END,
            v_t - interval '5 days');
  END LOOP;

  -- ---------- Notifications for the admin ----------
  IF v_admin_emp IS NOT NULL THEN
    INSERT INTO public.notifications (recipient_id, kind, title, body, link, critical, created_at, read_at)
    SELECT v_admin_emp, x.kind, x.title, x.body, x.link, x.critical, now() - x.age, CASE WHEN x.read THEN now() - x.age + interval '1 hour' END
      FROM (SELECT l.id, row_number() OVER (ORDER BY l.received_at DESC) AS rn
              FROM public.leads l WHERE l.email LIKE '%@mock-kunde.test' AND l.owner_id IS NULL) p
      CROSS JOIN LATERAL (VALUES
        ('lead_unassigned', 'Neuer Lead ohne Zuständigen', 'Bitte weisen Sie den Lead einer Person zu.',
         '/vertrieb/leads/' || p.id, true, p.rn * interval '3 hours', false)) AS x(kind, title, body, link, critical, age, read)
     WHERE p.rn <= 4;
    INSERT INTO public.notifications (recipient_id, kind, title, body, link, critical, created_at, read_at)
    SELECT v_admin_emp, 'lead_sla_breach', 'Erstkontakt-Frist überschritten',
           e.first_name || ' ' || e.last_name || ' hat einen Lead noch nicht kontaktiert.',
           '/vertrieb/leads/' || l.id, true, l.sla_due_at, NULL
      FROM public.leads l JOIN public.employees e ON e.id = l.owner_id
     WHERE l.email LIKE '%@mock-kunde.test' AND l.stage = 'assigned' AND l.sla_due_at < now()
     LIMIT 3;
    INSERT INTO public.notifications (recipient_id, kind, title, body, link, critical, created_at, read_at)
    SELECT v_admin_emp, 'task_due', 'Aufgabe fällig', t.title, '/vertrieb/kunden/' || t.linked_id, false,
           now() - interval '1 day' * row_number() OVER (), now() - interval '2 hours'
      FROM public.tasks t WHERE t.owner_id = v_admin_emp AND t.status = 'open' AND t.linked_type = 'customer'
     LIMIT 3;
  END IF;
END
$$;

COMMIT;

-- Summary
SELECT (SELECT count(*) FROM public.employees WHERE email LIKE '%@mock.profina.test') AS employees,
       (SELECT count(*) FROM public.hierarchy_assignments) AS assignments,
       (SELECT count(*) FROM public.production_records) AS production,
       (SELECT count(*) FROM public.leads WHERE email LIKE '%@mock-kunde.test') AS leads,
       (SELECT count(*) FROM public.customers WHERE email LIKE '%@mock-kunde.test') AS customers,
       (SELECT count(*) FROM public.tasks) AS tasks,
       (SELECT count(*) FROM public.activities) AS activities,
       (SELECT count(*) FROM public.notifications) AS notifications;
