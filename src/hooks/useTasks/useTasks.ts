"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { throwDbError } from "../../utils/dbErrors";
import type { Tables } from "../../types/supabase";

export type Task = Tables<"tasks">;
export type AppNotification = Tables<"notifications">;

const call = async (fn: Parameters<typeof supabase.rpc>[0], args: Record<string, unknown>) => {
  const { data, error } = await supabase.rpc(fn, args as never);
  if (error) throwDbError(error);
  return data;
};

/** How far back closed tasks are listed, and how many at most. */
export const CLOSED_TASK_DAYS = 90;
const CLOSED_TASK_LIMIT = 200;

/**
 * Tasks the caller may see (own + structure, RLS): every open task, plus the
 * closed ones of the last CLOSED_TASK_DAYS days. Two queries so a long
 * history can never push open tasks out of a row limit (P4-PERF-01).
 */
export function useTasks() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["tasks"],
    queryFn: async () => {
      const since = new Date(Date.now() - CLOSED_TASK_DAYS * 86_400_000).toISOString();
      const [open, closed] = await Promise.all([
        supabase.from("tasks").select("*").eq("status", "open").order("due_at", { nullsFirst: false }),
        supabase.from("tasks").select("*").neq("status", "open").gte("completed_at", since)
          .order("completed_at", { ascending: false }).limit(CLOSED_TASK_LIMIT),
      ]);
      for (const r of [open, closed]) if (r.error) throwDbError(r.error);
      return [...(open.data ?? []), ...(closed.data ?? [])] as Task[];
    },
    refetchInterval: 60_000,
  });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["tasks"] });
  const create = useMutation({
    mutationFn: (a: { ownerId: string; title: string; description: string; dueAt: string | null; priority: string }) =>
      call("rpc_create_task", { p_owner_id: a.ownerId, p_title: a.title, p_description: a.description || null, p_due_at: a.dueAt, p_priority: a.priority }),
    onSuccess: invalidate,
  });
  const setStatus = useMutation({
    mutationFn: (a: { id: string; status: "open" | "done" | "cancelled"; note?: string }) =>
      call("rpc_set_task_status", { p_task_id: a.id, p_status: a.status, p_note: a.note ?? null }),
    onSuccess: invalidate,
  });
  const reassign = useMutation({
    mutationFn: (a: { id: string; ownerId: string; reason: string }) =>
      call("rpc_reassign_task", { p_task_id: a.id, p_new_owner: a.ownerId, p_reason: a.reason }),
    onSuccess: invalidate,
  });
  const runGenerators = useMutation({
    mutationFn: () => call("rpc_run_task_generators", {}) as Promise<Record<string, number>>,
    onSuccess: () => {
      invalidate();
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
  return { ...query, create, setStatus, reassign, runGenerators };
}

export function useNotifications(enabled: boolean) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["notifications"],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.from("notifications").select("*").order("created_at", { ascending: false }).limit(30);
      if (error) throwDbError(error);
      return (data ?? []) as AppNotification[];
    },
    refetchInterval: 60_000,
  });
  const markRead = useMutation({
    mutationFn: (ids: string[] | null) => call("rpc_mark_notifications_read", { p_ids: ids }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });
  // The saved mutes, so the settings form opens with them ticked (P4-UX-07).
  const muted = useQuery({
    queryKey: ["notification-preferences"],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.from("notification_preferences").select("muted_kinds").maybeSingle();
      if (error) throwDbError(error);
      return (data?.muted_kinds ?? []) as string[];
    },
  });
  const mute = useMutation({
    mutationFn: (kinds: string[]) => call("rpc_set_muted_notifications", { p_kinds: kinds }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notification-preferences"] }),
  });
  return { ...query, markRead, mute, muted: muted.data };
}
