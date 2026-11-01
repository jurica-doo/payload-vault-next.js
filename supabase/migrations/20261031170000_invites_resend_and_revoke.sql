-- ============================================================
-- Invites: re-send until accepted; a revoked invite can't activate
-- ============================================================
-- GoTrue creates the auth user when the invite mail is sent, and the link
-- trigger attaches it to the employee right away. So:
--
-- 1. rpc_issue_invite refused every employee with a linked user
--    (`already_linked`) — i.e. every invite after the first mail. When the
--    link expired (1 h locally, 24 h hosted) the person was stuck. Now the
--    invite can be issued again while the linked user hasn't confirmed their
--    e-mail (GoTrue re-sends to an unconfirmed user); a confirmed account
--    still refuses.
--
-- 2. activate_on_confirm activated any invited employee whose e-mail got
--    confirmed, even after the admin had revoked the invite (the mail link
--    still works). Activation now needs an open invite.
-- ============================================================

CREATE OR REPLACE FUNCTION app_rpc.rpc_issue_invite(p_employee_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_emp public.employees%ROWTYPE;
BEGIN
  PERFORM app_private.assert_admin();

  SELECT * INTO v_emp FROM public.employees WHERE id = p_employee_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002'; END IF;
  -- A linked account blocks a new invite once it is in use: the employee is
  -- active (e.g. an existing vault account) or the e-mail is confirmed.
  IF v_emp.user_id IS NOT NULL AND (v_emp.status <> 'invited' OR EXISTS (
       SELECT 1 FROM auth.users u WHERE u.id = v_emp.user_id AND u.email_confirmed_at IS NOT NULL)) THEN
    RAISE EXCEPTION 'already_linked' USING ERRCODE = 'P0001';
  END IF;
  IF v_emp.status <> 'invited' THEN RAISE EXCEPTION 'invalid_status' USING ERRCODE = 'P0001'; END IF;

  UPDATE public.employee_invites
     SET revoked_at = now()
   WHERE employee_id = p_employee_id AND accepted_at IS NULL AND revoked_at IS NULL;

  INSERT INTO public.employee_invites (employee_id, email, invited_by, expires_at)
  VALUES (v_emp.id, v_emp.email, auth.uid(), now() + interval '7 days');

  PERFORM app_private.log_event('employee.invite_issued', 'public.employees', v_emp.id::text,
                                jsonb_build_object('email', v_emp.email));
  RETURN jsonb_build_object('employee_id', v_emp.id, 'email', v_emp.email);
END
$$;

CREATE OR REPLACE FUNCTION app_private.activate_on_confirm()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_open boolean;
BEGIN
  IF NEW.email_confirmed_at IS NOT NULL AND OLD.email_confirmed_at IS NULL THEN
    v_open := EXISTS (
      SELECT 1 FROM public.employee_invites i
       WHERE i.email = lower(btrim(NEW.email))
         AND i.accepted_at IS NULL AND i.revoked_at IS NULL AND i.expires_at > now());
    IF v_open THEN
      UPDATE public.employees e
         SET status = 'active'
       WHERE e.user_id = NEW.id AND e.status = 'invited';

      UPDATE public.employee_invites i
         SET accepted_at = now()
       WHERE i.email = lower(btrim(NEW.email))
         AND i.accepted_at IS NULL AND i.revoked_at IS NULL;
    END IF;
  END IF;
  RETURN NULL;
END
$$;
