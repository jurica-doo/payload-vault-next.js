import { ProtectedRoute } from "@/context/ProtectedRoutes";
import { AnalyticsPage } from "@/views/analytics/AnalyticsPage";

export default function Page() {
  return (
    <ProtectedRoute>
      <AnalyticsPage />
    </ProtectedRoute>
  );
}
