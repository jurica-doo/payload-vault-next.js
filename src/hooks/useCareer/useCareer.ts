"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { throwDbError } from "../../utils/dbErrors";

export type StructureProgress = {
  id: string;
  name: string;
  gross: string;
  gross_kv: string;
  eligible: string;
  eligible_kv: string;
  cap_applied: boolean;
};

/** Shape of rpc_career_progress (see migration 20261026190000). */
export type CareerProgress =
  | { status: "blocked"; reason: "no_period" | "no_level" | "no_rules_for_date"; period?: { type: string; start: string; end: string } }
  | { status: "top_level"; level: string }
  | {
      status: "ready" | "in_progress";
      employee_id: string;
      as_of: string;
      level: string;
      target: string;
      required: string;
      kv_required: string;
      cap_value: string | null;
      personal: { points: string; kv: string };
      structures: StructureProgress[];
      eligible: string;
      eligible_kv: string;
      points_missing: string;
      kv_missing: string;
      is_ready: boolean;
      window: { start: string; end: string };
      period: { type: "first_personal" | "transition" | "calendar"; start: string; end: string };
      expected_now: string | null;
    };

export function useCareerProgress(employeeId: string | null) {
  return useQuery({
    queryKey: ["careerProgress", employeeId ?? "me"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("rpc_career_progress", employeeId ? { p_employee_id: employeeId } : {});
      if (error) throwDbError(error);
      return data as unknown as CareerProgress;
    },
  });
}

/** The calculable variant of CareerProgress (in progress or ready). */
export type CareerProgressDetail = Extract<CareerProgress, { status: "ready" | "in_progress" }>;
export type QueueEntry = CareerProgressDetail & { status: "ready"; name: string; employee_no: string };

export function usePromotionQueue(enabled: boolean) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["promotionQueue"],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("rpc_promotion_queue");
      if (error) throwDbError(error);
      return (data ?? []) as unknown as QueueEntry[];
    },
  });
  const approve = useMutation({
    mutationFn: async (a: { employeeId: string; reason: string }) => {
      const { data, error } = await supabase.rpc("rpc_approve_promotion", { p_employee_id: a.employeeId, p_reason: a.reason });
      if (error) throwDbError(error);
      return data as string;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["promotionQueue"] });
      queryClient.invalidateQueries({ queryKey: ["careerProgress"] });
      queryClient.invalidateQueries({ queryKey: ["employees"] });
    },
  });
  return { ...query, approve };
}
