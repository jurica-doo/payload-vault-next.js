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

/** Tasks the caller may see (own + structure, RLS). */
export function useTasks() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["tasks"],
    queryFn: async () => {
      const { data, error } = await supabase.from("tasks").select("*").order("status").order("due_at", { nullsFirst: false }).limit(500);
      if (error) throwDbError(error);
      return (data ?? []) as Task[];
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
  return { ...query, create, setStatus, reassign };
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
  const mute = useMutation({ mutationFn: (kinds: string[]) => call("rpc_set_muted_notifications", { p_kinds: kinds }) });
  return { ...query, markRead, mute };
}
