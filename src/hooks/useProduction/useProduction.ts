"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { throwDbError } from "../../utils/dbErrors";
import type { Tables } from "../../types/supabase";

export type ProductionRow = Tables<"v_production">;
export type Calculation = Tables<"point_calculations">;

export type ProductionInput = {
  id: string | null;
  producerId: string;
  categoryCode: string;
  premiumAmount: string; // plain decimal string
  premiumPeriod: "monthly" | "annual" | "one_off";
  netOrGross: "net" | "gross" | null;
  termYears: string | null;
  productionDate: string;
  productReference: string;
  notes: string;
};

const listKey = ["production"] as const;
// Matches the API's max_rows (supabase/config.toml).
const IMPORT_ROWS_PAGE = 1000;

/** Production the caller may see (own + structure, RLS), newest first. */
export function useProduction(page: number, pageSize: number) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: [...listKey, page, pageSize],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const from = (page - 1) * pageSize;
      const { data, error, count } = await supabase
        .from("v_production")
        .select("*", { count: "exact" })
        .order("production_date", { ascending: false })
        .order("created_at", { ascending: false })
        .range(from, from + pageSize - 1);
      if (error) throwDbError(error);
      return { rows: (data ?? []) as ProductionRow[], total: count ?? 0 };
    },
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: listKey });
  const rpc = async (fn: Parameters<typeof supabase.rpc>[0], args: Record<string, unknown>) => {
    const { data, error } = await supabase.rpc(fn, args as never);
    if (error) throwDbError(error);
    return data;
  };

  const save = useMutation({
    mutationFn: (p: ProductionInput) =>
      rpc("rpc_save_production", {
        p_id: p.id,
        p_producer_id: p.producerId,
        p_category_code: p.categoryCode,
        p_premium_amount: p.premiumAmount,
        p_premium_period: p.premiumPeriod,
        p_net_or_gross: p.netOrGross,
        p_term_years: p.termYears,
        p_production_date: p.productionDate,
        p_product_reference: p.productReference || null,
        p_notes: p.notes || null,
      }) as Promise<string>,
    onSuccess: invalidate,
  });
  const submit = useMutation({ mutationFn: (id: string) => rpc("rpc_submit_production", { p_id: id }), onSuccess: invalidate });
  const removeDraft = useMutation({ mutationFn: (id: string) => rpc("rpc_delete_production_draft", { p_id: id }), onSuccess: invalidate });
  const markEligible = useMutation({ mutationFn: (id: string) => rpc("rpc_mark_production_eligible", { p_id: id }), onSuccess: invalidate });
  const cancel = useMutation({
    mutationFn: (a: { id: string; reason: string }) => rpc("rpc_cancel_production", { p_id: a.id, p_reason: a.reason }),
    onSuccess: invalidate,
  });

  return { ...query, save, submit, removeDraft, markEligible, cancel };
}

/** Ledger rows of one record, oldest first. */
export function useCalculations(productionId: string | null) {
  return useQuery({
    queryKey: ["calculations", productionId],
    enabled: !!productionId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("point_calculations")
        .select("*")
        .eq("production_id", productionId!)
        .order("seq");
      if (error) throwDbError(error);
      return (data ?? []) as Calculation[];
    },
  });
}

export type ImportRowInput = {
  source_id: string;
  employee_no: string;
  category: string;
  premium: string;
  period: string;
  net_or_gross: string;
  term_years: string;
  production_date: string;
  reference: string;
};

/** A staged row with the database's validation result (empty = valid). */
export type StagedImportRow = { row_number: number; raw: ImportRowInput; errors: string[] };

export function useProductionImport() {
  const queryClient = useQueryClient();

  const stage = useMutation({
    mutationFn: async (a: { sourceSystem: string; fileName: string; rows: ImportRowInput[] }) => {
      const { data, error } = await supabase.rpc("rpc_stage_production_import", {
        p_source_system: a.sourceSystem,
        p_file_name: a.fileName,
        p_rows: a.rows,
      });
      if (error) throwDbError(error);
      const batchId = data as string;
      // A batch holds up to 5000 rows; the API returns at most 1000 per request.
      const rows: StagedImportRow[] = [];
      for (let from = 0; ; from += IMPORT_ROWS_PAGE) {
        const page = await supabase
          .from("import_rows")
          .select("row_number, raw, errors")
          .eq("batch_id", batchId)
          .order("row_number")
          .range(from, from + IMPORT_ROWS_PAGE - 1);
        if (page.error) throwDbError(page.error);
        const chunk = (page.data ?? []) as StagedImportRow[];
        rows.push(...chunk);
        if (chunk.length < IMPORT_ROWS_PAGE) break;
      }
      return { batchId, rows };
    },
  });

  const commit = useMutation({
    mutationFn: async (batchId: string) => {
      const { data, error } = await supabase.rpc("rpc_commit_production_import", { p_batch_id: batchId });
      if (error) throwDbError(error);
      return data as number;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: listKey }),
  });

  return { stage, commit };
}
