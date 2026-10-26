"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { throwDbError } from "../../utils/dbErrors";
import { parseRules } from "../../domain/rules";
import type { Tables } from "../../types/supabase";

/** Rules in force on a date (default: today in Berlin, decided by the DB). */
export function useRules(date?: string) {
  return useQuery({
    queryKey: ["rules", date ?? "today"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("rpc_rules_at", date ? { p_date: date } : {});
      if (error) throwDbError(error);
      return parseRules(data);
    },
    staleTime: 1000 * 60 * 30,
  });
}

export type RuleVersion = Tables<"rule_versions">;
export type LevelRow = Tables<"career_levels">;
export type ConversionRow = Tables<"conversion_rules">;

/** Admin: every version (drafts included, RLS) with its rows. */
export function useRuleAdmin() {
  const queryClient = useQueryClient();
  const key = ["ruleAdmin"] as const;

  const query = useQuery({
    queryKey: key,
    queryFn: async () => {
      const [versions, levels, conversion] = await Promise.all([
        supabase.from("rule_versions").select("*").order("effective_from", { ascending: false }),
        supabase.from("career_levels").select("*").order("rank"),
        supabase.from("conversion_rules").select("*"),
      ]);
      if (versions.error) throwDbError(versions.error);
      if (levels.error) throwDbError(levels.error);
      if (conversion.error) throwDbError(conversion.error);
      return { versions: versions.data ?? [], levels: levels.data ?? [], conversion: conversion.data ?? [] };
    },
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: key });
    queryClient.invalidateQueries({ queryKey: ["rules"] });
  };

  const rpc = async (fn: Parameters<typeof supabase.rpc>[0], args: Record<string, unknown>) => {
    const { error } = await supabase.rpc(fn, args as never);
    if (error) throwDbError(error);
  };

  const createDraft = useMutation({
    mutationFn: (a: { kind: "levels" | "conversion"; label: string; effectiveFrom: string }) =>
      rpc("rpc_create_rule_draft", { p_kind: a.kind, p_label: a.label, p_effective_from: a.effectiveFrom }),
    onSuccess: invalidate,
  });
  const updateLevel = useMutation({
    mutationFn: (a: { versionId: string; row: LevelRow }) =>
      rpc("rpc_update_level_draft", {
        p_version_id: a.versionId,
        p_code: a.row.code,
        p_point_rate: a.row.point_rate,
        p_max_subsidy: a.row.max_subsidy,
        p_threshold_points: a.row.threshold_points,
        p_kv_min_ratio: a.row.kv_min_ratio,
        p_structure_cap_ratio: a.row.structure_cap_ratio,
      }),
    onSuccess: invalidate,
  });
  const updateConversion = useMutation({
    mutationFn: (a: { versionId: string; row: ConversionRow; aePerPoint: number | null }) =>
      rpc("rpc_update_conversion_draft", {
        p_version_id: a.versionId,
        p_category_code: a.row.category_code,
        p_divisor: a.row.divisor,
        p_max_term_years: a.row.max_term_years,
        p_ae_per_point: a.aePerPoint,
      }),
    onSuccess: invalidate,
  });
  const publish = useMutation({
    mutationFn: (a: { versionId: string; reason: string }) =>
      rpc("rpc_publish_rule_version", { p_version_id: a.versionId, p_reason: a.reason }),
    onSuccess: invalidate,
  });
  const deleteDraft = useMutation({
    mutationFn: (versionId: string) => rpc("rpc_delete_rule_draft", { p_version_id: versionId }),
    onSuccess: invalidate,
  });

  return { ...query, createDraft, updateLevel, updateConversion, publish, deleteDraft };
}
