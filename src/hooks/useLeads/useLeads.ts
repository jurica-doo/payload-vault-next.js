"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { throwDbError } from "../../utils/dbErrors";
import type { Tables } from "../../types/supabase";

export type Lead = Tables<"leads">;
export type LeadStage = Tables<"lead_stages">;
export type LeadSource = { id: string; name: string; kind: string; active: boolean };
export type LeadSla = {
  first_contact_hours: number; workday_start: string; workday_end: string; workdays: number[];
  holiday_region: string; escalate_to_manager: boolean; provisional: boolean;
};
export type LeadConfig = {
  stages: Omit<LeadStage, "updated_at">[];
  sources: LeadSource[];
  sla: LeadSla;
  holidays: { day: string; region: string; name: string }[];
};
export type DuplicateMatch = {
  id: string | null; lead_no: number | null; name: string | null; stage: string | null;
  owner: string | null; reason: "phone" | "email" | "name"; visible: boolean;
};
export type LeadInput = Partial<{
  first_name: string; last_name: string; company: string; phone: string | null; email: string | null;
  preferred_channel: string; source_id: string; campaign: string; referral: string; received_at: string;
  product_interest: string[]; region: string; priority: string; consent_basis: string | null; notes: string;
  next_action: string | null; next_action_at: string | null;
}>;

const call = async (fn: Parameters<typeof supabase.rpc>[0], args: Record<string, unknown>) => {
  const { data, error } = await supabase.rpc(fn, args as never);
  if (error) throwDbError(error);
  return data;
};

export const leadName = (l: Pick<Lead, "first_name" | "last_name" | "company">) =>
  [l.first_name, l.last_name].filter(Boolean).join(" ") || l.company || "Lead";
export const leadNo = (n: number) => `L-${String(n).padStart(5, "0")}`;

export function useLeadConfig() {
  return useQuery({
    queryKey: ["lead-config"],
    queryFn: async () => (await call("rpc_lead_config", {})) as unknown as LeadConfig,
    staleTime: 5 * 60_000,
  });
}

/** Leads visible to the caller (own, structure, pool for leaders; RLS). */
export function useLeads() {
  return useQuery({
    queryKey: ["leads"],
    queryFn: async () => {
      const { data, error } = await supabase.from("leads").select("*").order("received_at", { ascending: false }).limit(1000);
      if (error) throwDbError(error);
      return (data ?? []) as Lead[];
    },
    refetchInterval: 60_000,
  });
}

export function useLead(id: string) {
  return useQuery({
    queryKey: ["lead", id],
    queryFn: async () => {
      const [lead, stages, assignments] = await Promise.all([
        supabase.from("leads").select("*").eq("id", id).maybeSingle(),
        supabase.from("lead_stage_history").select("*").eq("lead_id", id).order("changed_at"),
        supabase.from("lead_assignments").select("*").eq("lead_id", id).order("assigned_at"),
      ]);
      for (const r of [lead, stages, assignments]) if (r.error) throwDbError(r.error);
      return {
        lead: lead.data as Lead | null,
        stageHistory: (stages.data ?? []) as Tables<"lead_stage_history">[],
        assignments: (assignments.data ?? []) as Tables<"lead_assignments">[],
      };
    },
  });
}

export async function findLeadDuplicates(a: { first_name?: string; last_name?: string; company?: string; phone?: string | null; email?: string | null; exclude?: string }) {
  return (await call("rpc_find_lead_duplicates", {
    p_first_name: a.first_name || null, p_last_name: a.last_name || null, p_company: a.company || null,
    p_phone: a.phone || null, p_email: a.email || null, p_exclude: a.exclude ?? null,
  })) as unknown as DuplicateMatch[];
}

export function useLeadMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["leads"] });
    queryClient.invalidateQueries({ queryKey: ["lead"] });
    queryClient.invalidateQueries({ queryKey: ["tasks"] });
  };
  const opts = { onSuccess: invalidate };
  return {
    create: useMutation({
      mutationFn: (a: { data: LeadInput; ownerId?: string | null; toPool?: boolean; confirmDuplicates?: boolean }) =>
        call("rpc_create_lead", { p_data: a.data, p_owner_id: a.ownerId ?? null, p_to_pool: a.toPool ?? false, p_confirm_duplicates: a.confirmDuplicates ?? false }) as Promise<string>,
      ...opts,
    }),
    update: useMutation({ mutationFn: (a: { id: string; data: LeadInput }) => call("rpc_update_lead", { p_lead_id: a.id, p_data: a.data }), ...opts }),
    setStage: useMutation({
      mutationFn: (a: { id: string; stage: string; note?: string; lossReason?: string | null; nextAction?: string | null; nextActionAt?: string | null }) =>
        call("rpc_set_lead_stage", {
          p_lead_id: a.id, p_stage: a.stage, p_note: a.note || null, p_loss_reason: a.lossReason ?? null,
          p_next_action: a.nextAction ?? null, p_next_action_at: a.nextActionAt ?? null, p_production_id: null,
        }),
      ...opts,
    }),
    assign: useMutation({
      mutationFn: (a: { id: string; ownerId: string | null; reason?: string }) =>
        call("rpc_assign_lead", { p_lead_id: a.id, p_owner_id: a.ownerId, p_reason: a.reason || null }) as Promise<{ appointments_moved: number }>,
      ...opts,
    }),
    merge: useMutation({
      mutationFn: (a: { keepId: string; mergeId: string; reason: string }) =>
        call("rpc_merge_leads", { p_keep_id: a.keepId, p_merge_id: a.mergeId, p_reason: a.reason }),
      ...opts,
    }),
  };
}

export function useLeadAdmin() {
  const queryClient = useQueryClient();
  const opts = { onSuccess: () => queryClient.invalidateQueries({ queryKey: ["lead-config"] }) };
  return {
    setSla: useMutation({ mutationFn: (a: { value: Omit<LeadSla, "provisional">; reason: string }) => call("rpc_set_lead_sla", { p_value: a.value, p_reason: a.reason }), ...opts }),
    saveSource: useMutation({
      mutationFn: (a: { id: string | null; name: string; kind: string; active: boolean }) =>
        call("rpc_save_lead_source", { p_id: a.id, p_name: a.name, p_kind: a.kind, p_active: a.active }),
      ...opts,
    }),
    setSourceCost: useMutation({
      mutationFn: (a: { sourceId: string; month: string; amount: string | null }) =>
        call("rpc_set_lead_source_cost", { p_source_id: a.sourceId, p_month: a.month, p_amount: a.amount, p_note: null }),
      onSuccess: () => queryClient.invalidateQueries({ queryKey: ["lead-source-costs"] }),
    }),
    updateStage: useMutation({
      mutationFn: (a: { code: string; requiredFields: string[]; allowSkip: boolean; active: boolean; reason: string }) =>
        call("rpc_update_lead_stage_config", { p_code: a.code, p_required_fields: a.requiredFields, p_allow_skip: a.allowSkip, p_active: a.active, p_reason: a.reason }),
      ...opts,
    }),
    setHoliday: useMutation({
      mutationFn: (a: { day: string; region: string; name: string | null }) => call("rpc_set_holiday", { p_day: a.day, p_region: a.region, p_name: a.name }),
      ...opts,
    }),
  };
}

export function useLeadSourceCosts(enabled: boolean) {
  return useQuery({
    queryKey: ["lead-source-costs"],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.from("lead_source_costs").select("*").order("month", { ascending: false }).limit(240);
      if (error) throwDbError(error);
      return (data ?? []) as Tables<"lead_source_costs">[];
    },
  });
}

export type LeadFunnel = {
  window: { from: string; to: string };
  scope: "me" | "team" | "all";
  totals: import("../../domain/funnel").FunnelTotals;
  first_contact: { contacted: number; avg_hours: number | null; median_hours: number | null; within_sla: number; overdue_open: number };
  by_source: { source_id: string; name: string; leads: number; contacted: number; booked: number; won: number; points: number; commission: number | null; cost: number | null; cost_per_lead: number | null; cost_per_sale: number | null }[];
  by_owner: { owner_id: string | null; name: string | null; leads: number; contacted: number; booked: number; won: number; avg_first_contact_hours: number | null }[];
  by_stage: { stage: string; name: string; leads: number; avg_age_days: number }[];
  loss_reasons: { reason: string; leads: number }[];
  by_month: { month: string; leads: number; won: number }[];
};

/** Lead cohort analytics for [from, to) (§9.4). */
export function useLeadFunnel(from: string | null, to: string | null, scope: "me" | "team" | "all") {
  return useQuery({
    queryKey: ["lead-funnel", from, to, scope],
    enabled: Boolean(from && to),
    queryFn: async () => (await call("rpc_lead_funnel", { p_from: from, p_to: to, p_scope: scope })) as unknown as LeadFunnel,
  });
}
