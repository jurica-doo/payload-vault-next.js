"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { throwDbError } from "../../utils/dbErrors";
import type { Tables } from "../../types/supabase";

export type PrivacyRequest = Tables<"privacy_requests">;
export type ExportLogRow = Tables<"export_log">;
export type SyncRun = Tables<"sync_runs">;
export type RetentionReport = {
  customer_years: number | null; lead_years: number | null;
  customers: { id: string; customer_no: number; inactive_since: string }[] | null;
  leads: { id: string; lead_no: number; closed_at: string }[] | null;
};

const call = async (fn: Parameters<typeof supabase.rpc>[0], args: Record<string, unknown>) => {
  const { data, error } = await supabase.rpc(fn, args as never);
  if (error) throwDbError(error);
  return data;
};

/** Data subject requests, export log, retention and sync overview (compliance/admin, §12.4). */
export function usePrivacy(enabled: boolean, withSync: boolean) {
  const queryClient = useQueryClient();
  const requests = useQuery({
    queryKey: ["privacy-requests"], enabled,
    queryFn: async () => {
      const { data, error } = await supabase.from("privacy_requests").select("*").order("status").order("due_at").limit(300);
      if (error) throwDbError(error);
      return (data ?? []) as PrivacyRequest[];
    },
  });
  const exports = useQuery({
    queryKey: ["export-log"], enabled,
    queryFn: async () => {
      const { data, error } = await supabase.from("export_log").select("*").order("at", { ascending: false }).limit(50);
      if (error) throwDbError(error);
      return (data ?? []) as ExportLogRow[];
    },
  });
  const retention = useQuery({
    queryKey: ["retention"], enabled,
    queryFn: async () => (await call("rpc_retention_candidates", {})) as unknown as RetentionReport,
  });
  const syncRuns = useQuery({
    queryKey: ["sync-runs"], enabled: enabled && withSync,
    queryFn: async () => {
      const { data, error } = await supabase.from("sync_runs").select("*").order("started_at", { ascending: false }).limit(20);
      if (error) throwDbError(error);
      return (data ?? []) as SyncRun[];
    },
  });
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["privacy-requests"] });
    queryClient.invalidateQueries({ queryKey: ["export-log"] });
    queryClient.invalidateQueries({ queryKey: ["customers"] });
    queryClient.invalidateQueries({ queryKey: ["customer"] });
  };
  return {
    requests, exports, retention, syncRuns,
    findSubject: (type: "customer" | "lead", no: number) =>
      call("rpc_find_privacy_subject", { p_subject_type: type, p_number: no }) as Promise<{ id: string; erased: boolean } | null>,
    open: useMutation({
      mutationFn: (a: { kind: string; subjectType: string; subjectId: string; via: string; note: string; receivedAt: string | null }) =>
        call("rpc_open_privacy_request", {
          p_kind: a.kind, p_subject_type: a.subjectType, p_subject_id: a.subjectId, p_received_via: a.via,
          p_note: a.note || null, p_received_at: a.receivedAt,
        }),
      onSuccess: invalidate,
    }),
    close: useMutation({
      mutationFn: (a: { id: string; status: "completed" | "rejected"; outcome: string }) =>
        call("rpc_close_privacy_request", { p_id: a.id, p_status: a.status, p_outcome: a.outcome }),
      onSuccess: invalidate,
    }),
    exportData: useMutation({ mutationFn: (id: string) => call("rpc_export_subject_data", { p_request_id: id }), onSuccess: invalidate }),
    erase: useMutation({ mutationFn: (id: string) => call("rpc_erase_subject", { p_request_id: id }), onSuccess: invalidate }),
  };
}
