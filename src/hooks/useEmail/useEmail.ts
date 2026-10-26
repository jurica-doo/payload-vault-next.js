"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
