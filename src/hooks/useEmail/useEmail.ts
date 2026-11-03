"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { throwDbError } from "../../utils/dbErrors";
import type { Tables } from "../../types/supabase";

export type EmailTemplate = Tables<"email_templates">;
export type TemplateVersion = Tables<"email_template_versions">;

const call = async (fn: Parameters<typeof supabase.rpc>[0], args: Record<string, unknown>) => {
  const { data, error } = await supabase.rpc(fn, args as never);
  if (error) throwDbError(error);
  return data;
};

/** Templates with all versions (admin/compliance; RLS). */
export function useEmailTemplates(enabled: boolean) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["email-templates"], enabled,
    queryFn: async () => {
      const [t, v] = await Promise.all([
        supabase.from("email_templates").select("*").order("name"),
        supabase.from("email_template_versions").select("*").order("version", { ascending: false }),
      ]);
      for (const r of [t, v]) if (r.error) throwDbError(r.error);
      return { templates: (t.data ?? []) as EmailTemplate[], versions: (v.data ?? []) as TemplateVersion[] };
    },
  });
  const opts = { onSuccess: () => queryClient.invalidateQueries({ queryKey: ["email-templates"] }) };
  return {
    ...query,
    saveTemplate: useMutation({
      mutationFn: (a: { id: string | null; name: string; purpose: string; allowedBases: string[] }) =>
        call("rpc_save_email_template", { p_id: a.id, p_name: a.name, p_purpose: a.purpose, p_allowed_bases: a.allowedBases }) as Promise<string>,
      ...opts,
    }),
    saveDraft: useMutation({
      mutationFn: (a: { templateId: string; subject: string; body: string }) =>
        call("rpc_save_template_draft", { p_template_id: a.templateId, p_subject: a.subject, p_body: a.body }),
      ...opts,
    }),
    submit: useMutation({ mutationFn: (id: string) => call("rpc_submit_template_version", { p_version_id: id }), ...opts }),
    decide: useMutation({
      mutationFn: (a: { id: string; approve: boolean; note?: string }) =>
        call("rpc_decide_template_version", { p_version_id: a.id, p_approve: a.approve, p_note: a.note ?? null }),
      ...opts,
    }),
  };
}

export type Campaign = Tables<"email_campaigns">;
export type SendLogRow = Tables<"email_send_log">;
export type Suppression = Tables<"email_suppressions">;
export type EmailStatus = {
  enabled: boolean; window_start: string; window_end: string; window_days: number[]; daily_limit: number;
  in_window: boolean; last_7_days: Record<string, number>;
};

export type SuppressionImportResult = {
  added: number; already_blocked: number; failed: number; errors: { row: number; code: string }[];
};
export type SendLogEntry = SendLogRow & { customers: { customer_no: number } | null };
type Page = { page: number; pageSize: number };

/** Server-side search and pages, so the list never stops silently at a limit (P6-07). */
export function useSuppressions(enabled: boolean, { search, page, pageSize }: Page & { search: string }) {
  return useQuery({
    queryKey: ["email-suppressions", search, page, pageSize], enabled, placeholderData: keepPreviousData,
    queryFn: async () => {
      let q = supabase.from("email_suppressions").select("*", { count: "exact" });
      const term = search.trim().toLowerCase().replace(/[\\%_]/g, (c) => `\\${c}`);
      if (term) q = q.ilike("email", `%${term}%`);
      const from = (page - 1) * pageSize;
      const { data, error, count } = await q.order("created_at", { ascending: false }).range(from, from + pageSize - 1);
      if (error) throwDbError(error);
      return { rows: (data ?? []) as Suppression[], total: count ?? 0 };
    },
  });
}

/** Send log filtered and paged in the database (P6-06), with the customer's K-number. */
export function useSendLog(enabled: boolean, { status, page, pageSize }: Page & { status: string }) {
  return useQuery({
    queryKey: ["email-log", status, page, pageSize], enabled, placeholderData: keepPreviousData,
    queryFn: async () => {
      let q = supabase.from("email_send_log").select("*, customers(customer_no)", { count: "exact" });
      if (status) q = q.eq("status", status);
      const from = (page - 1) * pageSize;
      const { data, error, count } = await q.order("created_at", { ascending: false }).range(from, from + pageSize - 1);
      if (error) throwDbError(error);
      return { rows: (data ?? []) as unknown as SendLogEntry[], total: count ?? 0 };
    },
  });
}

/** Kill switch, window, campaigns, suppressions and the send log (admin/compliance). */
export function useEmailOps(enabled: boolean) {
  const queryClient = useQueryClient();
  const status = useQuery({ queryKey: ["email-status"], enabled, queryFn: async () => (await call("rpc_email_status", {})) as unknown as EmailStatus });
  const campaigns = useQuery({
    queryKey: ["email-campaigns"], enabled,
    queryFn: async () => {
      const { data, error } = await supabase.from("email_campaigns").select("*").order("created_at", { ascending: false });
      if (error) throwDbError(error);
      return (data ?? []) as Campaign[];
    },
  });
  const invalidate = (...keys: string[]) => () => keys.forEach((k) => queryClient.invalidateQueries({ queryKey: [k] }));
  return {
    status, campaigns,
    setEnabled: useMutation({
      mutationFn: (a: { enabled: boolean; reason: string }) => call("rpc_set_email_enabled", { p_enabled: a.enabled, p_reason: a.reason }),
      onSuccess: invalidate("email-status"),
    }),
    setWindow: useMutation({
      mutationFn: (a: { start: string; end: string; days: number[]; dailyLimit: number; reason: string }) =>
        call("rpc_set_email_window", { p_start: a.start, p_end: a.end, p_days: a.days, p_daily_limit: a.dailyLimit, p_reason: a.reason }),
      onSuccess: invalidate("email-status"),
    }),
    saveCampaign: useMutation({
      mutationFn: (a: { name: string; templateId: string; kind: string; sendOn: string | null }) =>
        call("rpc_save_campaign", { p_id: null, p_name: a.name, p_template_id: a.templateId, p_kind: a.kind, p_send_on: a.sendOn }),
      onSuccess: invalidate("email-campaigns"),
    }),
    campaignAction: useMutation({
      mutationFn: (a: { id: string; action: string; reason?: string }) => call("rpc_set_campaign_status", { p_id: a.id, p_action: a.action, p_reason: a.reason ?? null }),
      onSuccess: invalidate("email-campaigns"),
    }),
    setSuppression: useMutation({
      mutationFn: (a: { email: string; suppressed: boolean; reason?: string; note?: string }) =>
        call("rpc_set_suppression", { p_email: a.email, p_suppressed: a.suppressed, p_reason: a.reason ?? "manual", p_note: a.note || null }),
      onSuccess: invalidate("email-suppressions"),
    }),
    importSuppressions: useMutation({
      mutationFn: async (a: { rows: { email: string; reason?: string }[]; reason: string; note?: string }) =>
        (await call("rpc_import_suppressions", { p_rows: a.rows, p_reason: a.reason, p_note: a.note || null })) as unknown as SuppressionImportResult,
      onSuccess: invalidate("email-suppressions"),
    }),
    sendTest: useMutation({ mutationFn: (versionId: string) => call("rpc_send_test_email", { p_version_id: versionId }), onSuccess: invalidate("email-log") }),
  };
}

/** Newest entries shown per customer; the card says how many there are in total. */
export const CUSTOMER_EMAIL_LIMIT = 50;

/** Email history of one customer (§10.1); advisers see their customers' rows. */
export function useCustomerEmails(customerId: string) {
  return useQuery({
    queryKey: ["customer-emails", customerId],
    queryFn: async () => {
      const { data, error, count } = await supabase.from("email_send_log").select("*", { count: "exact" })
        .eq("customer_id", customerId).order("created_at", { ascending: false }).limit(CUSTOMER_EMAIL_LIMIT);
      if (error) throwDbError(error);
      return { rows: (data ?? []) as SendLogRow[], total: count ?? 0 };
    },
  });
}
