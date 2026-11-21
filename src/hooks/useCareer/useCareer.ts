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
  /** The strongest structure: the only one the 50 % clause limits. */
  strongest?: boolean;
  kv_cap_applied?: boolean;
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
      /** Minimum own business (FB 30, TL 60 EP); null when the target has none. */
      own_required: string | null;
      own_missing: string;
      own_ok: boolean;
      /** Nachhaltigkeitsquote = net ÷ (net + cancelled); ratio null without settled business. */
      retention: { settled: string; cancelled: string; ratio: string | null; required: string | null; ok: boolean };
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

/** Shape of rpc_career_confirmation (migration 20261101220000); null = no confirmation year. */
export type Confirmation = {
  status: "pending" | "running" | "met" | "missed" | "kept" | "demoted";
  employee_id: string;
  promotion_id: string;
  level: string;
  previous_level: string | null;
  promoted_on: string;
  /** First and last day of the confirmation year. */
  start: string;
  end: string;
  required: string;
  threshold: string;
  achieved: string;
  personal: string | null;
  structure: string | null;
  missing: string;
  decision: "kept" | "demoted" | null;
  decided_at: string | null;
  demoted_to: string | null;
};
export type ConfirmationEntry = Confirmation & { name: string; employee_no: string };

export function useCareerConfirmation(employeeId: string | null) {
  return useQuery({
    queryKey: ["careerConfirmation", employeeId ?? "me"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("rpc_career_confirmation", employeeId ? { p_employee_id: employeeId } : {});
      if (error) throwDbError(error);
      return (data ?? null) as unknown as Confirmation | null;
    },
  });
}

/** Admin: everyone in a confirmation year; decide after a missed year. */
export function useConfirmationQueue(enabled: boolean) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["confirmationQueue"],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("rpc_confirmation_queue");
      if (error) throwDbError(error);
      return (data ?? []) as unknown as ConfirmationEntry[];
    },
  });
  const decide = useMutation({
    mutationFn: async (a: { employeeId: string; demote: boolean; reason: string }) => {
      const { data, error } = await supabase.rpc("rpc_decide_confirmation", {
        p_employee_id: a.employeeId, p_demote: a.demote, p_reason: a.reason,
      });
      if (error) throwDbError(error);
      return data as "kept" | "demoted";
    },
    onSuccess: () => {
      for (const key of ["confirmationQueue", "careerConfirmation", "careerProgress", "promotionQueue", "employees", "tasks"]) {
        queryClient.invalidateQueries({ queryKey: [key] });
      }
    },
  });
  return { ...query, decide };
}
