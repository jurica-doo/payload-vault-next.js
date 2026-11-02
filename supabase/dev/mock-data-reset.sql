-- ============================================================
-- LOCAL DEV ONLY: removes everything supabase/dev/mock-data.sql created.
--
--   docker exec -i supabase_db_payload-vault psql -U postgres -v ON_ERROR_STOP=1 < supabase/dev/mock-data-reset.sql
--
-- Append-only tables (levels, calculations) refuse deletes by trigger, so
-- this session runs with triggers off (superuser only). Audit log rows from
-- the seed stay, like every other audit entry.
-- ============================================================

BEGIN;
SET LOCAL session_replication_role = replica;

CREATE TEMP TABLE mock_emp ON COMMIT DROP AS
  SELECT id, user_id FROM public.employees WHERE email LIKE '%@mock.profina.test';
CREATE TEMP TABLE mock_prod ON COMMIT DROP AS
  SELECT id FROM public.production_records WHERE producer_id IN (SELECT id FROM mock_emp);
CREATE TEMP TABLE mock_lead ON COMMIT DROP AS
  SELECT id FROM public.leads WHERE email LIKE '%@mock-kunde.test';
CREATE TEMP TABLE mock_cust ON COMMIT DROP AS
  SELECT id FROM public.customers WHERE email LIKE '%@mock-kunde.test';
CREATE TEMP TABLE mock_link ON COMMIT DROP AS
  SELECT id FROM mock_lead UNION SELECT id FROM mock_cust;

-- Triggers are off, so FK cascades do not run either: delete children explicitly.
DELETE FROM public.notifications n
 WHERE n.recipient_id IN (SELECT id FROM mock_emp)
    OR EXISTS (SELECT 1 FROM mock_link m WHERE n.link LIKE '%' || m.id::text);
DELETE FROM public.tasks WHERE linked_id IN (SELECT id FROM mock_link)
   OR owner_id IN (SELECT id FROM mock_emp) OR created_by IN (SELECT id FROM mock_emp);
DELETE FROM public.activities WHERE linked_id IN (SELECT id FROM mock_link)
   OR owner_id IN (SELECT id FROM mock_emp);
DELETE FROM public.customer_service_items WHERE customer_id IN (SELECT id FROM mock_cust)
   OR owner_id IN (SELECT id FROM mock_emp);
DELETE FROM public.customer_consents WHERE customer_id IN (SELECT id FROM mock_cust);
DELETE FROM public.customer_assignments WHERE customer_id IN (SELECT id FROM mock_cust);
DELETE FROM public.lead_stage_history WHERE lead_id IN (SELECT id FROM mock_lead);
DELETE FROM public.lead_assignments WHERE lead_id IN (SELECT id FROM mock_lead);
DELETE FROM public.leads WHERE id IN (SELECT id FROM mock_lead);
DELETE FROM public.customers WHERE id IN (SELECT id FROM mock_cust);

DELETE FROM public.commission_ledger WHERE production_id IN (SELECT id FROM mock_prod)
   OR producer_id IN (SELECT id FROM mock_emp) OR recipient_id IN (SELECT id FROM mock_emp);
DELETE FROM public.point_calculations WHERE production_id IN (SELECT id FROM mock_prod);
DELETE FROM public.production_records WHERE id IN (SELECT id FROM mock_prod);
DELETE FROM public.career_level_history WHERE employee_id IN (SELECT id FROM mock_emp)
   OR reason LIKE 'Mock-Daten%';
DELETE FROM public.hierarchy_assignments WHERE employee_id IN (SELECT id FROM mock_emp)
   OR manager_id IN (SELECT id FROM mock_emp) OR change_reason LIKE 'Mock-Daten%';
DELETE FROM public.notifications WHERE recipient_id IN (SELECT id FROM mock_emp);
DELETE FROM public.notification_preferences WHERE employee_id IN (SELECT id FROM mock_emp);
DELETE FROM public.career_periods WHERE employee_id IN (SELECT id FROM mock_emp);
DELETE FROM public.employee_invites WHERE employee_id IN (SELECT id FROM mock_emp);
DELETE FROM public.employees WHERE id IN (SELECT id FROM mock_emp);
DELETE FROM public.user_roles WHERE user_id IN (SELECT user_id FROM mock_emp);
DELETE FROM auth.users WHERE id IN (SELECT user_id FROM mock_emp WHERE user_id IS NOT NULL);

DELETE FROM public.lead_source_costs WHERE source_id IN (
  SELECT id FROM public.lead_sources
   WHERE name IN ('Messe Finanzforum', 'Social Media', 'Partnerbüro Nord', 'Vergleichsportal', 'Altkampagne 2025'));
DELETE FROM public.lead_source_costs WHERE month BETWEEN DATE '2025-12-01' AND DATE '2026-11-01';
DELETE FROM public.lead_sources
 WHERE name IN ('Messe Finanzforum', 'Social Media', 'Partnerbüro Nord', 'Vergleichsportal', 'Altkampagne 2025')
   AND NOT EXISTS (SELECT 1 FROM public.leads l WHERE l.source_id = lead_sources.id);

COMMIT;

SELECT count(*) AS mock_employees_left FROM public.employees WHERE email LIKE '%@mock.profina.test';
