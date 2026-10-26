"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { throwDbError } from "../../utils/dbErrors";
import type { Tables } from "../../types/supabase";

type Money = number | string;
export type Bucket = { gross: Money; reserve: Money; net: Money; entries: number };
export type Statement = {
  employee_id: string;
  month: string;
  period_status: "open" | "reviewed" | "approved" | "paid";
  buckets: { personal: Bucket; direct: Bucket; indirect: Bucket };
  total: Bucket;
  subsidy: { approved: Money; max: Money | null; note: string; override: boolean } | null;
};
export type LedgerEntry = Tables<"v_commission_ledger">;
export type OverviewRow = { recipient_id: string; recipient_name: string; employee_no: string; gross: number; reserve: number; net: number; entries: number; subsidy: number | null };
export type ExceptionItem = Tables<"exception_queue">;

const rpc = async <T,>(fn: Parameters<typeof supabase.rpc>[0], args: Record<string, unknown>): Promise<T> => {
  const { data, error } = await supabase.rpc(fn, args as never);
  if (error) throwDbError(error);
  return data as T;
};

/** One person's statement for a month (own when employeeId is null). */
export function useStatement(month: string, employeeId: string | null) {
  return useQuery({
    queryKey: ["statement", month, employeeId ?? "me"],
    queryFn: () => rpc<Statement>("rpc_statement", { p_month: month, ...(employeeId ? { p_employee_id: employeeId } : {}) }),
  });
}

/** Ledger entries of a recipient in a month (RLS/view rule applies). */
export function useLedgerEntries(month: string, recipientId: string | null) {
  return useQuery({
    queryKey: ["ledger", month, recipientId],
    enabled: !!recipientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_commission_ledger")
        .select("*")
        .eq("period_month", month)
        .eq("recipient_id", recipientId!)
        .order("seq");
      if (error) throwDbError(error);
      return (data ?? []) as LedgerEntry[];
    },
  });
}

/** Finance: overview, periods, exceptions and all write actions. */
export function useFinance(month: string, enabled: boolean) {
  const queryClient = useQueryClient();
  const overview = useQuery({
    queryKey: ["statementOverview", month],
    enabled,
    queryFn: () => rpc<OverviewRow[]>("rpc_statement_overview", { p_month: month }),
  });
  const period = useQuery({
    queryKey: ["statementPeriod", month],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.from("statement_periods").select("*").eq("period_month", month).maybeSingle();
      if (error) throwDbError(error);
      return data?.status ?? "open";
    },
  });
  const exceptions = useQuery({
    queryKey: ["exceptions"],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.from("exception_queue").select("*").eq("status", "open").order("created_at");
      if (error) throwDbError(error);
      return (data ?? []) as ExceptionItem[];
    },
  });

  const invalidate = () => {
    for (const key of [["statementOverview"], ["statementPeriod"], ["exceptions"], ["statement"], ["ledger"]]) {
      queryClient.invalidateQueries({ queryKey: key });
    }
  };

  const setStatus = useMutation({
    mutationFn: (a: { status: string; reason: string }) =>
      rpc("rpc_set_statement_status", { p_month: month, p_status: a.status, p_reason: a.reason }),
    onSuccess: invalidate,
  });
  const setSubsidy = useMutation({
    mutationFn: (a: { employeeId: string; amount: string; note: string; reason: string; override: string | null }) =>
      rpc("rpc_set_subsidy", {
        p_employee_id: a.employeeId, p_month: month, p_amount: a.amount, p_coverage_note: a.note,
        p_reason: a.reason, p_override_reason: a.override,
      }),
    onSuccess: invalidate,
  });
  const retry = useMutation({
    mutationFn: (calculationId: string) => rpc<number>("rpc_retry_commission", { p_calculation_id: calculationId }),
    onSuccess: invalidate,
  });
  const dismiss = useMutation({
    mutationFn: (a: { id: string; reason: string }) => rpc("rpc_dismiss_exception", { p_id: a.id, p_reason: a.reason }),
    onSuccess: invalidate,
  });

  return { overview, period, exceptions, setStatus, setSubsidy, retry, dismiss };
}

export const logExport = (kind: "statement" | "statement_overview", month: string, rows: number) =>
  rpc("rpc_log_export", { p_kind: kind, p_scope: { month }, p_row_count: rows });
