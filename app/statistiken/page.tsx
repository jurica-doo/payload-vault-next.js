import { ProtectedRoute } from "@/context/ProtectedRoutes";
import { StatisticsPage } from "@/views/statistics/StatisticsPage";

export default function Page() {
  return (
    <ProtectedRoute>
      <StatisticsPage />
    </ProtectedRoute>
  );
}
