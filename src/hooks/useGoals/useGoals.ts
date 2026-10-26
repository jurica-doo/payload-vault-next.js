"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { throwDbError } from "../../utils/dbErrors";
import type { Tables } from "../../types/supabase";

export type Goal = Tables<"v_goals">;
export type GoalTargets = Partial<Record<
  "points" | "kv_points" | "ae" | "expected_gross" | "appointments_booked" | "appointments_held" | "offers" | "sales" | "followups",
  number | string
>> & { development_goal?: string };

const key = ["goals"] as const;

/** Goals the caller may see (own + structure, RLS), newest month first. */
export function useGoals() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await supabase.from("v_goals").select("*").order("month", { ascending: false }).limit(200);
      if (error) throwDbError(error);
      return (data ?? []) as Goal[];
    },
  });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: key });
  const call = async (fn: Parameters<typeof supabase.rpc>[0], args: Record<string, unknown>) => {
    const { data, error } = await supabase.rpc(fn, args as never);
    if (error) throwDbError(error);
    return data;
  };
  const saveDraft = useMutation({
    mutationFn: (a: { month: string; targets: GoalTargets }) => call("rpc_save_goal_draft", { p_month: a.month, p_targets: a.targets }) as Promise<string>,
    onSuccess: invalidate,
  });
  const submit = useMutation({
    mutationFn: (a: { goalId: string; comment: string }) => call("rpc_submit_goal", { p_goal_id: a.goalId, p_comment: a.comment || null }),
    onSuccess: invalidate,
  });
  const review = useMutation({
    mutationFn: (a: { goalId: string; decision: "approved" | "returned"; comment: string }) =>
      call("rpc_review_goal", { p_goal_id: a.goalId, p_decision: a.decision, p_comment: a.comment || null }),
    onSuccess: invalidate,
  });
  return { ...query, saveDraft, submit, review };
}
