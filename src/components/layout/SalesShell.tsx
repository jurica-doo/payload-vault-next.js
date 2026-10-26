"use client";

import Link from "next/link";
import { type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { HeaderHome } from "../header/HeaderHome";
import { MiniFooter } from "../footer/MiniFooter";
import { LoadingScreen } from "../loadingScreen/LoadingScreen";
import { EmptyState } from "../emptyState/EmptyState";
import { usePermissions } from "../../hooks/permissions/usePermissions";
import { canSeeModule } from "../../hooks/permissions/permissions";
import { moduleForPath } from "../../data/salesModules";
import { NotificationBell } from "../notifications/NotificationBell";

/**
 * Chrome for /vertrieb/* and /admin/*. Every route is checked against the
 * module registry: a module that is switched off or not meant for this user
 * shows the same neutral "not available" page, whether it exists or not, so
 * the page doesn't reveal which modules are in the works. The database
 * enforces access again on every query; this is the UX layer only.
 */
export const SalesShell = ({ children }: { children: ReactNode }) => {
  const pathname = usePathname();
  const { permissions, modules, isLoading, isError } = usePermissions();
  const current = moduleForPath(pathname);
  const allowed = !!current && canSeeModule(permissions, current);
  const tabs = modules.filter((m) => m.key !== "admin");
  const isAdminArea = current?.key === "admin";

  if (isLoading) return <LoadingScreen />;

  return (
    <div className="flex min-h-screen flex-col">
      <div className="sticky top-0 z-40">
        <HeaderHome
          isTwoHeaders
          isSticky={false}
          pageTitle={allowed ? current.label : "Vertrieb"}
          showYearSelector={false}
        />
      </div>

      {allowed && !isAdminArea && tabs.length > 1 && (
        <nav aria-label="Vertriebsbereiche" className="flex items-center gap-2 border-b border-color-border-light px-4">
          <ul className="flex flex-1 gap-1 overflow-x-auto">
            {tabs.map((m) => {
              const active = m.key === current.key;
              return (
                <li key={m.key}>
                  <Link
                    href={m.href}
                    aria-current={active ? "page" : undefined}
                    className={`block whitespace-nowrap border-b-2 px-3 py-2.5 text-sm no-underline hover:no-underline ${
                      active
                        ? "border-color-primary text-color-primary"
                        : "border-transparent text-color-text-subtle hover:text-color-text-main"
                    }`}
                  >
                    {m.label}
                  </Link>
                </li>
              );
            })}
          </ul>
          {permissions.employeeId && <NotificationBell />}
        </nav>
      )}

      <main className="flex flex-1 flex-col">
        <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
          {allowed ? (
            children
          ) : (
            <EmptyState
              message="Dieser Bereich ist für Sie nicht freigeschaltet."
              hint={
                isError
                  ? "Ihre Berechtigungen konnten nicht geladen werden. Bitte später erneut versuchen."
                  : "Wenden Sie sich an Ihre Führungskraft oder die Verwaltung, falls Sie Zugriff benötigen."
              }
            />
          )}
        </div>
        <div className="pb-6">
          <MiniFooter />
        </div>
      </main>
    </div>
  );
};
