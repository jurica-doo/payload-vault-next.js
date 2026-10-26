"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { throwDbError } from "../../utils/dbErrors";
import { buildStructure, type StructureRow } from "./structure";

const structureKey = ["structure"] as const;

/** Today's structure as far as the caller may see it (RLS-filtered). */
export function useStructure() {
  return useQuery({
    queryKey: structureKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_current_hierarchy")
        .select("employee_id, first_name, last_name, employee_no, status, manager_id");
      if (error) throwDbError(error);
      const rows = (data ?? []).filter((r): r is StructureRow => r.employee_id !== null) as StructureRow[];
      return buildStructure(rows);
    },
    staleTime: 1000 * 60,
  });
}

export type Assignment = {
  id: string;
  manager_id: string | null;
  effective_from: string;
  effective_to: string | null;
  change_reason: string | null;
  created_at: string;
};

/** Full reporting-line history of one employee (admin page). */
export function useAssignments(employeeId: string | null) {
  const queryClient = useQueryClient();
  const key = ["assignments", employeeId] as const;

  const query = useQuery({
    queryKey: key,
    enabled: !!employeeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hierarchy_assignments")
        .select("id, manager_id, effective_from, effective_to, change_reason, created_at")
        .eq("employee_id", employeeId!)
        .order("effective_from", { ascending: false });
      if (error) throwDbError(error);
      return (data ?? []) as Assignment[];
    },
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: key });
    queryClient.invalidateQueries({ queryKey: structureKey });
    queryClient.invalidateQueries({ queryKey: ["myContext"] });
  };

  const assign = useMutation({
    mutationFn: async (args: { managerId: string | null; effectiveFrom: string; reason: string }) => {
      const { error } = await supabase.rpc("rpc_assign_manager", {
        p_employee_id: employeeId!,
        // The generated types mark the argument as string; NULL means "top of a structure".
        p_manager_id: args.managerId as string,
        p_effective_from: args.effectiveFrom,
        p_reason: args.reason,
      });
      if (error) throwDbError(error);
    },
    onSuccess: invalidate,
  });

  const cancelFuture = useMutation({
    mutationFn: async (args: { assignmentId: string; reason: string }) => {
      const { error } = await supabase.rpc("rpc_cancel_future_assignment", {
        p_assignment_id: args.assignmentId,
        p_reason: args.reason,
      });
      if (error) throwDbError(error);
    },
    onSuccess: invalidate,
  });

  return { ...query, assign, cancelFuture };
}
