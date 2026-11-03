"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { throwDbError } from "../../utils/dbErrors";
import type { Tables } from "../../types/supabase";

export type Activity = Tables<"activities">;
export type ActivityType = "call" | "email" | "contact_attempt" | "appointment" | "offer" | "followup" | "note";
export type AppointmentOutcome = "held" | "no_show" | "cancelled" | "rescheduled";

export type ActivitySummary = {
  contact_attempts: number;
  reached: number;
  appointments_booked: number;
  appointments_held: number;
  no_shows: number;
  offers: number;
  followups: number;
  upcoming_appointments: number;
};

export type ActivityFilter = { ownerId?: string; linkedType?: "lead" | "customer"; linkedId?: string };

const call = async (fn: Parameters<typeof supabase.rpc>[0], args: Record<string, unknown>) => {
  const { data, error } = await supabase.rpc(fn, args as never);
  if (error) throwDbError(error);
  return data;
};

/** Newest activities loaded per list; the panel says so when the limit is reached. */
export const ACTIVITY_LIMIT = 300;

/** Activities visible to the caller (own + structure, RLS), optionally for one person or record. */
export function useActivities(filter: ActivityFilter = {}) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["activities", filter.ownerId ?? null, filter.linkedType ?? null, filter.linkedId ?? null],
    queryFn: async () => {
      let q = supabase.from("activities").select("*").order("occurred_at", { ascending: false }).limit(ACTIVITY_LIMIT);
      if (filter.ownerId) q = q.eq("owner_id", filter.ownerId);
      if (filter.linkedType && filter.linkedId) q = q.eq("linked_type", filter.linkedType).eq("linked_id", filter.linkedId);
      const { data, error } = await q;
      if (error) throwDbError(error);
      return (data ?? []) as Activity[];
    },
  });
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["activities"] });
    queryClient.invalidateQueries({ queryKey: ["activity-summary"] });
    // Activities move the lead's stage and first contact, and close tasks (P4-R2-02).
    queryClient.invalidateQueries({ queryKey: ["lead"] });
    queryClient.invalidateQueries({ queryKey: ["leads"] });
    queryClient.invalidateQueries({ queryKey: ["tasks"] });
    queryClient.invalidateQueries({ queryKey: ["customer"] });
  };
  const log = useMutation({
    mutationFn: (a: {
      type: ActivityType; occurredAt?: string | null; scheduledAt?: string | null;
      outcome?: string | null; notes?: string; ownerId?: string | null;
      /** Defaults to the panel's record; a follow-up appointment keeps the original's link. */
      linkedType?: string | null; linkedId?: string | null;
    }) =>
      call("rpc_log_activity", {
        p_type: a.type,
        p_linked_type: a.linkedType !== undefined ? a.linkedType : filter.linkedType ?? null,
        p_linked_id: a.linkedId !== undefined ? a.linkedId : filter.linkedId ?? null,
        p_occurred_at: a.occurredAt ?? null, p_scheduled_at: a.scheduledAt ?? null,
        p_outcome: a.outcome ?? null, p_notes: a.notes || null, p_owner_id: a.ownerId ?? null,
      }),
    onSuccess: invalidate,
  });
  const setOutcome = useMutation({
    mutationFn: (a: { id: string; outcome: AppointmentOutcome; notes?: string }) =>
      call("rpc_set_appointment_outcome", { p_activity_id: a.id, p_outcome: a.outcome, p_notes: a.notes || null }),
    onSuccess: invalidate,
  });
  return { ...query, log, setOutcome };
}

/** Counts for one employee in [from, to) — the shared funnel definitions (§8.2). */
export function useActivitySummary(employeeId: string | null | undefined, from: string, to: string) {
  return useQuery({
    queryKey: ["activity-summary", employeeId, from, to],
    enabled: Boolean(employeeId),
    queryFn: async () => (await call("rpc_activity_summary", { p_employee_id: employeeId, p_from: from, p_to: to })) as unknown as ActivitySummary,
  });
}

/** Name and L-number of the leads linked from a list of activities (P4-UX-03). */
export function useLinkedLeadNames(ids: string[]) {
  const key = [...new Set(ids)].sort();
  return useQuery({
    queryKey: ["lead-names", key],
    enabled: key.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("leads").select("id, lead_no, first_name, last_name, company").in("id", key);
      if (error) throwDbError(error);
      return new Map((data ?? []).map((l) => [l.id, l]));
    },
    staleTime: 5 * 60_000,
  });
}
