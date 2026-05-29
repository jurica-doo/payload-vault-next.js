import { ProtectedRoute } from "@/context/ProtectedRoutes";
import { HomePage } from "@/views/home/HomePage";

export default function Page() {
  return (
    <ProtectedRoute>
      <HomePage />
    </ProtectedRoute>
  );
}
