"use client";

import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { throwDbError } from "../../utils/dbErrors";
import type { GoalTargets } from "../useGoals/useGoals";

type Num = number | string;
export type Totals = { points: Num; kv_points: Num; ae: Num };

export type MyDashboard = {
  month: string;
  as_of: string;
  production: Totals;
  year: Totals;
  trend: { month: string; points: Num }[];
  goal: { status: string; targets: GoalTargets } | null;
  career: {
    status: string; reason: string | null; level: string | null; target: string | null;
    eligible: Num | null; required: Num | null; eligible_kv: Num | null; kv_required: Num | null;
    expected_now: Num | null; period_end: string | null; window_start: string | null;
  };
  commission: { gross: Num; net: Num };
  todo: { drafts: number; goal_missing: boolean; goals_to_review: number };
};

export type TeamDashboard = {
  month: string;
  team_size: number;
  structure_total: Totals;
  direct_reports: {
    employee_id: string; name: string; status: string; level: string | null;
    own: Totals; structure: Totals; team_size: number;
    goal: { status: string; targets: GoalTargets } | null; career_status: string | null;
  }[];
};

export type AdminDashboard = {
  without_level: { id: string; name: string }[];
  without_assignment: { id: string; name: string }[];
  expired_invites: number;
  production_to_confirm: number;
  open_exceptions: number;
  goals_to_review: number;
  unapproved_past_months: string[];
};

const rpc = async <T,>(fn: Parameters<typeof supabase.rpc>[0]): Promise<T> => {
  const { data, error } = await supabase.rpc(fn);
  if (error) throwDbError(error);
  return data as T;
};

export const useMyDashboard = (enabled: boolean) =>
  useQuery({ queryKey: ["dashboard", "me"], enabled, queryFn: () => rpc<MyDashboard>("rpc_dashboard_me") });
export const useTeamDashboard = (enabled: boolean) =>
  useQuery({ queryKey: ["dashboard", "team"], enabled, queryFn: () => rpc<TeamDashboard>("rpc_dashboard_team") });
export const useAdminDashboard = (enabled: boolean) =>
  useQuery({ queryKey: ["dashboard", "admin"], enabled, queryFn: () => rpc<AdminDashboard>("rpc_dashboard_admin") });
