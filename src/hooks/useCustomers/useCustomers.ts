"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { throwDbError } from "../../utils/dbErrors";
import type { Tables } from "../../types/supabase";

export type Customer = Tables<"customers">;
export type CustomerInput = Partial<{
  first_name: string; last_name: string; company: string; preferred_name: string; date_of_birth: string | null;
  phone: string | null; email: string | null; street: string; postal_code: string; city: string;
  preferred_channel: string; status: string; next_follow_up_at: string | null; notes: string;
}>;
export type CustomerDuplicate = {
  id: string | null; customer_no: number | null; name: string | null; owner: string | null;
  reason: "phone" | "email" | "name"; visible: boolean;
};

const call = async (fn: Parameters<typeof supabase.rpc>[0], args: Record<string, unknown>) => {
  const { data, error } = await supabase.rpc(fn, args as never);
  if (error) throwDbError(error);
  return data;
};

export const customerName = (c: Pick<Customer, "first_name" | "last_name" | "company">) =>
  [c.first_name, c.last_name].filter(Boolean).join(" ") || c.company || "Kunde";
export const customerNo = (n: number) => `K-${String(n).padStart(5, "0")}`;

/** Customers visible to the caller (own, structure; admins and compliance all — RLS). */
export function useCustomers() {
  return useQuery({
    queryKey: ["customers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("customers").select("*").order("last_name").limit(2000);
      if (error) throwDbError(error);
      return (data ?? []) as Customer[];
    },
  });
}

export function useCustomer(id: string) {
  return useQuery({
    queryKey: ["customer", id],
    queryFn: async () => {
      const [customer, assignments] = await Promise.all([
        supabase.from("customers").select("*").eq("id", id).maybeSingle(),
        supabase.from("customer_assignments").select("*").eq("customer_id", id).order("assigned_at"),
      ]);
      for (const r of [customer, assignments]) if (r.error) throwDbError(r.error);
      return {
        customer: customer.data as Customer | null,
        assignments: (assignments.data ?? []) as Tables<"customer_assignments">[],
      };
    },
  });
}

export async function findCustomerDuplicates(a: { first_name?: string; last_name?: string; company?: string; phone?: string | null; email?: string | null; exclude?: string }) {
  return (await call("rpc_find_customer_duplicates", {
    p_first_name: a.first_name || null, p_last_name: a.last_name || null, p_company: a.company || null,
    p_phone: a.phone || null, p_email: a.email || null, p_exclude: a.exclude ?? null,
  })) as unknown as CustomerDuplicate[];
}

export function useCustomerMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["customers"] });
    queryClient.invalidateQueries({ queryKey: ["customer"] });
  };
  const opts = { onSuccess: invalidate };
  return {
    create: useMutation({
      mutationFn: (a: { data: CustomerInput; ownerId?: string | null; confirmDuplicates?: boolean }) =>
        call("rpc_create_customer", { p_data: a.data, p_owner_id: a.ownerId ?? null, p_confirm_duplicates: a.confirmDuplicates ?? false }) as Promise<string>,
      ...opts,
    }),
    update: useMutation({ mutationFn: (a: { id: string; data: CustomerInput }) => call("rpc_update_customer", { p_customer_id: a.id, p_data: a.data }), ...opts }),
    assign: useMutation({
      mutationFn: (a: { id: string; ownerId: string; reason: string }) => call("rpc_assign_customer", { p_customer_id: a.id, p_owner_id: a.ownerId, p_reason: a.reason }),
      ...opts,
    }),
    archive: useMutation({
      mutationFn: (a: { id: string; archived: boolean; reason: string }) => call("rpc_archive_customer", { p_customer_id: a.id, p_archived: a.archived, p_reason: a.reason }),
      ...opts,
    }),
    convertLead: useMutation({
      mutationFn: (a: { leadId: string; confirmDuplicates?: boolean }) =>
        call("rpc_convert_lead", { p_lead_id: a.leadId, p_confirm_duplicates: a.confirmDuplicates ?? false }) as Promise<string>,
      onSuccess: () => {
        invalidate();
        queryClient.invalidateQueries({ queryKey: ["lead"] });
        queryClient.invalidateQueries({ queryKey: ["leads"] });
      },
    }),
  };
}
