import { type ReactNode } from "react";
import { ProtectedRoute } from "@/context/ProtectedRoutes";
import { SalesShell } from "@/components/layout/SalesShell";

export default function SalesLayout({ children }: { children: ReactNode }) {
  return (
    <ProtectedRoute>
      <SalesShell>{children}</SalesShell>
    </ProtectedRoute>
  );
}
