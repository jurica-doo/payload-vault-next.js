import type { ReactNode } from "react";

/**
 * Hides UI the current user may not use. This is presentation only: the
 * database enforces every permission again (RLS / RPC checks), so a hidden
 * button is never the security boundary.
 */
export const RoleGate = ({
  when,
  fallback = null,
  children,
}: {
  when: boolean;
  fallback?: ReactNode;
  children: ReactNode;
}) => <>{when ? children : fallback}</>;
