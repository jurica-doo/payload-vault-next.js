import { type ReactNode } from "react";
import { ProtectedRoute } from "@/context/ProtectedRoutes";
import { ProfileShell } from "@/components/layout/ProfileShell";

export default function ProfileLayout({ children }: { children: ReactNode }) {
  return (
    <ProtectedRoute>
      <ProfileShell>{children}</ProfileShell>
    </ProtectedRoute>
  );
}
