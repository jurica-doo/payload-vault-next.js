"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { throwDbError } from "../../utils/dbErrors";
import type { Tables } from "../../types/supabase";

export type CoachingSession = Tables<"coaching_sessions">;
export type CoachingAction = Tables<"coaching_actions">;
export type CoachingNote = Tables<"coaching_notes">;

export type Prompt =
  | { code: "kv_gap"; value: string | number }
  | { code: "declining_trend"; recent: number; before: number }
  | { code: "behind_goal"; actual: number; target: number }
  | { code: "overdue_actions"; count: number };

export type PerformanceProfile = {
  employee: { id: string; name: string; status: string; start_date: string; level: string | null };
  trend: { month: string; points: number; kv: number }[];
  product_mix: { category: string; contracts: number; points: number }[];
  goals: { month: string; status: string; target: number | null; actual: number }[];
  career: { status: string; target?: string; eligible?: string; required?: string; kv_missing?: string; points_missing?: string };
  prompts: Prompt[];
  next_review_on: string | null;
};

export function useProfile(employeeId: string) {
  return useQuery({
    queryKey: ["profile", employeeId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("rpc_performance_profile", { p_employee_id: employeeId });
      if (error) throwDbError(error);
      return data as unknown as PerformanceProfile;
    },
  });
}

/** Coaching records visible to the caller for one employee (RLS decides). */
export function useCoaching(employeeId: string | null) {
  const queryClient = useQueryClient();
  const key = ["coaching", employeeId] as const;

  const query = useQuery({
    queryKey: key,
    enabled: !!employeeId,
    queryFn: async () => {
      const [sessions, actions, notes] = await Promise.all([
        supabase.from("coaching_sessions").select("*").eq("employee_id", employeeId!).order("held_on", { ascending: false }),
        supabase.from("coaching_actions").select("*").eq("employee_id", employeeId!).order("due_on", { ascending: true, nullsFirst: false }),
        supabase.from("coaching_notes").select("*").eq("employee_id", employeeId!).order("created_at", { ascending: false }),
      ]);
      if (sessions.error) throwDbError(sessions.error);
      if (actions.error) throwDbError(actions.error);
      if (notes.error) throwDbError(notes.error);
      return {
        sessions: (sessions.data ?? []) as CoachingSession[],
        actions: (actions.data ?? []) as CoachingAction[],
        notes: (notes.data ?? []) as CoachingNote[],
      };
    },
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: key });
    queryClient.invalidateQueries({ queryKey: ["profile", employeeId] });
    queryClient.invalidateQueries({ queryKey: ["myActions"] });
  };
  const call = async (fn: Parameters<typeof supabase.rpc>[0], args: Record<string, unknown>) => {
    const { error } = await supabase.rpc(fn, args as never);
    if (error) throwDbError(error);
  };

  const addSession = useMutation({
    mutationFn: (a: { heldOn: string; summary: string; participants: string; nextReviewOn: string | null; actions: { title: string; owner: "employee" | "leader"; due_on: string | null }[] }) =>
      call("rpc_add_coaching_session", {
        p_employee_id: employeeId, p_held_on: a.heldOn, p_summary: a.summary,
        p_participants: a.participants || null, p_next_review_on: a.nextReviewOn, p_actions: a.actions,
      }),
    onSuccess: invalidate,
  });
  const setActionStatus = useMutation({
    mutationFn: (a: { id: string; status: "open" | "done" | "cancelled" }) =>
      call("rpc_set_coaching_action_status", { p_action_id: a.id, p_status: a.status }),
    onSuccess: invalidate,
  });
  const addNote = useMutation({
    mutationFn: (a: { visibility: "private_manager" | "shared"; body: string }) =>
      call("rpc_add_coaching_note", { p_employee_id: employeeId, p_visibility: a.visibility, p_body: a.body }),
    onSuccess: invalidate,
  });

  return { ...query, addSession, setActionStatus, addNote };
}
