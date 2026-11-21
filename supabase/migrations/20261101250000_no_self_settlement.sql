-- ============================================================
-- Four eyes on settlements (2026-11-21, journey test)
-- ============================================================
-- An admin who is also an employee could confirm ("Abrechnung bestätigen")
-- their own production and so book their own commission. The producer can
-- no longer confirm their own records; another admin or finance does.
-- ============================================================
CREATE OR REPLACE FUNCTION app_rpc.rpc_mark_production_eligible(
  p_id           uuid,
  p_policy_date  date DEFAULT NULL,
  p_own_contract boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row    public.production_records%ROWTYPE;
  v_policy date;
BEGIN
  PERFORM app_private.assert_finance_or_admin();
  SELECT * INTO v_row FROM public.production_records WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002'; END IF;
  IF v_row.status <> 'submitted' THEN RAISE EXCEPTION 'invalid_status' USING ERRCODE = 'P0001'; END IF;
  -- Four eyes: nobody confirms their own production (it books their own
  -- commission). Found in the journey test 2026-11-21.
  IF v_row.producer_id = app_private.current_employee_id() THEN
    RAISE EXCEPTION 'cannot_confirm_own' USING ERRCODE = '42501';
  END IF;

  v_policy := coalesce(p_policy_date, v_row.production_date);
  IF v_policy > app_private.business_today() THEN
    RAISE EXCEPTION 'policy_date_in_future' USING ERRCODE = 'P0001';
  END IF;
  IF v_policy < v_row.production_date THEN
    RAISE EXCEPTION 'policy_before_production' USING ERRCODE = 'P0001';
  END IF;

  -- The facts first: the calculation books commission in its insert trigger.
  UPDATE public.production_records
     SET policy_date = v_policy, own_contract = coalesce(p_own_contract, false)
   WHERE id = p_id;
  PERFORM app_private.write_original_calculation(p_id, 'Abrechnung bestätigt');
  UPDATE public.production_records SET status = 'eligible', eligible_at = now() WHERE id = p_id;
END
$$;
SELECT app_private.publish_rpc('app_rpc.rpc_mark_production_eligible(uuid, date, boolean)'::regprocedure);
