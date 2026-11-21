-- ============================================================
-- Lead settings for role-only admins (2026-11-21)
-- ============================================================
-- rpc_lead_config refused every caller without an active employee record,
-- so an admin account that is not a sales employee got 403 on
-- /admin/leads (found on production). Admins and compliance may read the
-- configuration too; everything else is unchanged.
-- ============================================================
CREATE OR REPLACE FUNCTION app_rpc.rpc_lead_config()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF app_private.current_employee_id() IS NULL
     AND NOT (app_private.has_role('admin') OR app_private.has_role('compliance')) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object(
    'stages', (SELECT jsonb_agg(to_jsonb(s) - 'updated_at' ORDER BY s.position) FROM public.lead_stages s),
    'sources', (SELECT jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'kind', s.kind, 'active', s.active) ORDER BY s.name)
                  FROM public.lead_sources s),
    'sla', (SELECT value FROM public.app_settings WHERE key = 'lead_sla'),
    'holidays', (SELECT coalesce(jsonb_agg(jsonb_build_object('day', c.day, 'region', c.region, 'name', c.name) ORDER BY c.day), '[]')
                   FROM public.business_calendar c WHERE c.day >= app_private.business_today() - 400));
END
$$;
SELECT app_private.publish_rpc('app_rpc.rpc_lead_config()'::regprocedure);
