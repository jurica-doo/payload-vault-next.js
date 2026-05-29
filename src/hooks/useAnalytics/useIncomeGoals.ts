import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import type { IncomeGoal, NewIncomeGoal } from "./types";

function useIncomeGoals(userId: string, year: number) {
  const queryClient = useQueryClient();

  const query = useQuery<IncomeGoal[]>({
    queryKey: ["incomeGoals", userId, year],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("income_goals")
        .select("*")
        .eq("user_id", userId)
        .eq("year", year)
        .order("month", { nullsFirst: true });
      if (error) throw error;
      return data as IncomeGoal[];
    },
    enabled: !!userId,
    staleTime: 1000 * 60 * 10,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({
      queryKey: ["incomeGoals", userId, year],
    });
  };

  const upsertGoal = useMutation<IncomeGoal, Error, NewIncomeGoal>({
    mutationFn: async (goal) => {
      // NULL != NULL in PostgreSQL, so onConflict can't match annual goals (month IS NULL).
      // Use explicit update for annual goals when one already exists.
      if (goal.month === null) {
        const { data: existing } = await supabase
          .from("income_goals")
          .select("id")
          .eq("user_id", goal.user_id)
          .eq("year", goal.year)
          .is("month", null)
          .maybeSingle();

        if (existing) {
          const { data, error } = await supabase
            .from("income_goals")
            .update({
              goal_amount: goal.goal_amount,
              updated_at: new Date().toISOString(),
            })
            .eq("id", existing.id)
            .select()
            .single();
          if (error) throw error;
          return data as IncomeGoal;
        }
      }

      const { data, error } = await supabase
        .from("income_goals")
        .upsert(
          {
            user_id: goal.user_id,
            year: goal.year,
            month: goal.month,
            goal_amount: goal.goal_amount,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id,year,month" },
        )
        .select()
        .single();
      if (error) throw error;
      return data as IncomeGoal;
    },
    onSuccess: invalidate,
  });

  const removeGoal = useMutation<void, Error, string>({
    mutationFn: async (id) => {
      const { error } = await supabase
        .from("income_goals")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return { ...query, upsertGoal, removeGoal };
}

export { useIncomeGoals };
