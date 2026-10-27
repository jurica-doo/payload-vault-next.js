"use client";

import { type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { AppShell } from "./AppShell";
import { LockIcon } from "../icons";
import { LoadingScreen } from "../loadingScreen/LoadingScreen";
import { EmptyState } from "../emptyState/EmptyState";
import { usePermissions } from "../../hooks/permissions/usePermissions";
import { canSeeModule } from "../../hooks/permissions/permissions";
import { moduleForPath } from "../../data/salesModules";
import { NotificationBell } from "../notifications/NotificationBell";

/**
 * Access gate for /vertrieb/* and /admin/* inside the app shell. Every route is checked against the
 * module registry: a module that is switched off or not meant for this user
 * shows the same neutral "not available" page, whether it exists or not, so
 * the page doesn't reveal which modules are in the works. The database
 * enforces access again on every query; this is the UX layer only.
 */
export const SalesShell = ({ children }: { children: ReactNode }) => {
  const pathname = usePathname();
  const { permissions, isLoading, isError } = usePermissions();
  const current = moduleForPath(pathname);
  const allowed = !!current && canSeeModule(permissions, current);

  if (isLoading) return <LoadingScreen />;

  return (
    <AppShell
      title={allowed ? current.label : "Vertrieb"}
      actions={permissions.employeeId ? <NotificationBell /> : undefined}
    >
      {allowed ? (
        children
      ) : (
        <div className="ui-card mx-auto mt-6 max-w-lg">
          <EmptyState
            icon={LockIcon}
            message="Dieser Bereich ist für Sie nicht freigeschaltet."
            hint={
              isError
                ? "Ihre Berechtigungen konnten nicht geladen werden. Bitte später erneut versuchen."
                : "Wenden Sie sich an Ihre Führungskraft oder die Verwaltung, falls Sie Zugriff benötigen."
            }
          />
        </div>
      )}
    </AppShell>
  );
};
