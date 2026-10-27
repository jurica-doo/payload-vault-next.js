"use client";

import { throwDbError } from "../../utils/dbErrors";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../context/AuthContext";
import { derivePermissions, NO_PERMISSIONS, visibleModules, type Permissions } from "./permissions";
import type { SalesModule } from "../../data/salesModules";

export const myContextQueryKey = (userId: string | undefined) => ["myContext", userId] as const;

/**
 * Who the signed-in user is in the sales system (employee, roles, flags).
 * One cached RPC per user; every component reads from the same cache.
 * While loading, or on error, the user has no sales permissions — the UI
 * fails closed and the vault keeps working.
 */
export function usePermissions(): {
  permissions: Permissions;
  modules: SalesModule[];
  isLoading: boolean;
  isError: boolean;
} {
  const { user } = useAuth();

  const query = useQuery({
    queryKey: myContextQueryKey(user?.id),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("rpc_my_context");
      if (error) throwDbError(error);
      return data;
    },
    enabled: !!user,
    staleTime: 1000 * 60 * 5,
    retry: 1,
  });

  const permissions = query.data ? derivePermissions(query.data) : NO_PERMISSIONS;

  return {
    permissions,
    modules: visibleModules(permissions),
    isLoading: !!user && query.isLoading,
    isError: query.isError,
  };
}
