"use client";

import { FunctionsHttpError } from "@supabase/supabase-js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { dbErrorMessage, throwDbError } from "../../utils/dbErrors";
import type { Tables } from "../../types/supabase";

export type Employee = Tables<"employees">;
export type AppRole = "admin" | "finance" | "compliance";
export type EmployeeWithRoles = Employee & { roles: AppRole[]; openInvite: boolean; levelCode: string | null };

export type NewEmployee = {
  firstName: string;
  lastName: string;
  email: string;
  startDate: string;
  employmentType: "full_time" | "part_time";
  phone: string | null;
};

const employeesKey = ["employees"] as const;

/**
 * Sends the invite email through the invite-employee Edge Function. The
 * function re-checks admin + MFA in the database; its JSON error carries the
 * same machine keys as RPC errors.
 */
async function sendInvite(employeeId: string): Promise<void> {
  const { error } = await supabase.functions.invoke("invite-employee", {
    body: { employee_id: employeeId },
  });
  if (!error) return;
  if (error instanceof FunctionsHttpError) {
    const body = await error.context.json().catch(() => null);
    throw new Error(dbErrorMessage({ message: body?.error }));
  }
  throw new Error(dbErrorMessage(null));
}

/**
 * Admin view of all employees with their roles and invite state. RLS limits
 * what non-admins get back, so the hook is safe to call anywhere, but only
 * the admin page uses the role/invite columns.
 */
export function useEmployees() {
  const queryClient = useQueryClient();

  const query = useQuery<EmployeeWithRoles[]>({
    queryKey: employeesKey,
    queryFn: async () => {
      const [employees, roles, invites, levels] = await Promise.all([
        supabase.from("employees").select("*").order("last_name").order("first_name"),
        supabase.from("user_roles").select("user_id, role").is("revoked_at", null),
        supabase
          .from("employee_invites")
          .select("employee_id, expires_at")
          .is("accepted_at", null)
          .is("revoked_at", null),
        supabase
          .from("career_level_history")
          .select("employee_id, level_code, effective_from, created_at")
          .order("effective_from", { ascending: false })
          .order("created_at", { ascending: false }),
      ]);
      if (employees.error) throwDbError(employees.error);
      if (roles.error) throwDbError(roles.error);
      if (invites.error) throwDbError(invites.error);
      if (levels.error) throwDbError(levels.error);

      // Current level = latest entry effective today or earlier (Berlin date).
      const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date());
      const levelByEmployee = new Map<string, string>();
      for (const l of levels.data ?? []) {
        if (l.effective_from <= today && !levelByEmployee.has(l.employee_id)) {
          levelByEmployee.set(l.employee_id, l.level_code);
        }
      }

      const now = Date.now();
      const openInvites = new Set(
        (invites.data ?? [])
          .filter((i) => new Date(i.expires_at).getTime() > now)
          .map((i) => i.employee_id),
      );
      const rolesByUser = new Map<string, AppRole[]>();
      for (const r of roles.data ?? []) {
        rolesByUser.set(r.user_id, [...(rolesByUser.get(r.user_id) ?? []), r.role as AppRole]);
      }
      return (employees.data ?? []).map((e) => ({
        ...e,
        roles: e.user_id ? (rolesByUser.get(e.user_id) ?? []) : [],
        openInvite: openInvites.has(e.id),
        levelCode: levelByEmployee.get(e.id) ?? null,
      }));
    },
    staleTime: 1000 * 30,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: employeesKey });
    // Own roles may have changed → refresh the permission context too.
    queryClient.invalidateQueries({ queryKey: ["myContext"] });
  };

  const createEmployee = useMutation({
    mutationFn: async (input: NewEmployee) => {
      const { data, error } = await supabase.rpc("rpc_create_employee", {
        p_first_name: input.firstName,
        p_last_name: input.lastName,
        p_email: input.email,
        p_start_date: input.startDate,
        p_employment_type: input.employmentType,
        p_phone: input.phone ?? undefined,
      });
      if (error) throwDbError(error);
      const result = data as { employee_id: string; needs_invite: boolean };
      // The employee exists even if sending fails; the admin can resend.
      if (result.needs_invite) {
        try {
          await sendInvite(result.employee_id);
        } catch (e) {
          return { ...result, inviteError: e instanceof Error ? e.message : dbErrorMessage(null) };
        }
      }
      return { ...result, inviteError: null as string | null };
    },
    onSettled: invalidate,
  });

  const resendInvite = useMutation({
    mutationFn: sendInvite,
    onSettled: invalidate,
  });

  const setActive = useMutation({
    mutationFn: async (args: { employeeId: string; active: boolean; reason: string }) => {
      const { error } = await supabase.rpc("rpc_set_employee_active", {
        p_employee_id: args.employeeId,
        p_active: args.active,
        p_reason: args.reason,
      });
      if (error) throwDbError(error);
    },
    onSuccess: invalidate,
  });

  const setRole = useMutation({
    mutationFn: async (args: { userId: string; role: AppRole; grant: boolean; reason: string }) => {
      const { error } = await supabase.rpc(args.grant ? "rpc_grant_role" : "rpc_revoke_role", {
        p_user_id: args.userId,
        p_role: args.role,
        p_reason: args.reason,
      });
      if (error) throwDbError(error);
    },
    onSuccess: invalidate,
  });

  const setLevel = useMutation({
    mutationFn: async (args: { employeeId: string; levelCode: string; effectiveFrom: string; reason: string }) => {
      const { data, error } = await supabase.rpc("rpc_set_employee_level", {
        p_employee_id: args.employeeId,
        p_level_code: args.levelCode,
        p_effective_from: args.effectiveFrom,
        p_reason: args.reason,
      });
      if (error) throwDbError(error);
      return data as "initial" | "admin_correction";
    },
    onSuccess: invalidate,
  });

  return { ...query, createEmployee, resendInvite, setActive, setRole, setLevel };
}
