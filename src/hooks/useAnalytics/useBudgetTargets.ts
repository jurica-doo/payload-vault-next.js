import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import type { BudgetTarget, NewBudgetTarget } from "./types";

function useBudgetTargets(userId: string, year: number) {
  const queryClient = useQueryClient();

  const query = useQuery<BudgetTarget[]>({
    queryKey: ["budgetTargets", userId, year],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("budget_targets")
        .select("*")
        .eq("user_id", userId)
        .eq("year", year)
        .order("category");
      if (error) throw error;
      return data as BudgetTarget[];
    },
    enabled: !!userId,
    staleTime: 1000 * 60 * 10,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({
      queryKey: ["budgetTargets", userId, year],
    });
  };

  const upsertTarget = useMutation<BudgetTarget, Error, NewBudgetTarget>({
    mutationFn: async (target) => {
      const { data, error } = await supabase
        .from("budget_targets")
        .upsert(
          {
            user_id: target.user_id,
            year: target.year,
            category: target.category,
            budget_amount: target.budget_amount,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id,year,category" },
        )
        .select()
        .single();
      if (error) throw error;
      return data as BudgetTarget;
    },
    onSuccess: invalidate,
  });

  const removeTarget = useMutation<void, Error, string>({
    mutationFn: async (id) => {
      const { error } = await supabase
        .from("budget_targets")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return { ...query, upsertTarget, removeTarget };
}

export { useBudgetTargets };
