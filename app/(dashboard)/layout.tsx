import { type ReactNode } from "react";
import { ProtectedRoute } from "@/context/ProtectedRoutes";
import { TitleProvider } from "@/context/title/TitleContext";
import { DashboardShell } from "@/components/layout/DashboardShell";

export default function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <ProtectedRoute>
      <TitleProvider>
        <DashboardShell>{children}</DashboardShell>
      </TitleProvider>
    </ProtectedRoute>
  );
}
