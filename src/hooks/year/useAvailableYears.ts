import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../context/AuthContext";

async function fetchAvailableYears(
    userId: string | undefined,
): Promise<number[]> {
    if (!userId) {
        return [new Date().getFullYear()];
    }

    const { data, error: rpcError } = await supabase.rpc(
        "get_user_report_years",
    );

    if (rpcError) {
        throw rpcError;
    }

    const currentYear = new Date().getFullYear();
    const fetchedYears: number[] =
        data?.map((row: { year: number }) => row.year) ?? [];

    const mergedYears = [...new Set([currentYear, ...fetchedYears])];
    mergedYears.sort((a, b) => b - a);

    return mergedYears;
}

export function useAvailableYears() {
    const { user } = useAuth();
    const queryClient = useQueryClient();

    const query = useQuery({
        queryKey: ["availableYears", user?.id],
        queryFn: () => fetchAvailableYears(user?.id),
        staleTime: 1000 * 60 * 5,
        enabled: !!user?.id,
        placeholderData: [new Date().getFullYear()],
    });

    const refetch = async () => {
        await queryClient.invalidateQueries({ queryKey: ["availableYears"] });
    };

    return {
        availableYears: query.data ?? [new Date().getFullYear()],
        isLoading: query.isLoading,
        error: query.error?.message ?? null,
        refetch,
    };
}
