"use client";

import { type ReactNode, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { HeaderHome } from "../header/HeaderHome";
import { MiniFooter } from "../footer/MiniFooter";
import { Sidebar } from "./Sidebar";
import { usePermissions } from "../../hooks/permissions/usePermissions";
import { parentNavHref, visibleNavigation } from "../../data/navigation";

const COLLAPSE_KEY = "sidebar-collapsed";

type AppShellProps = {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  showYearSelector?: boolean;
  /** Top-bar slot: the page's primary action and/or notifications. */
  actions?: ReactNode;
  /** Content width: default 72rem, narrow 48rem (settings), wide = full. */
  width?: "default" | "narrow" | "wide";
  /** Set false for pages that draw their own content container. */
  padded?: boolean;
};

const widthClasses = {
  default: "max-w-6xl",
  narrow: "max-w-3xl",
  wide: "max-w-none",
};

/**
 * Authenticated app chrome: sidebar navigation + top bar + content + footer.
 * Every signed-in area (vault, sales, admin, profile) renders inside it, so
 * navigation lives in one place.
 */
export const AppShell = ({
  children,
  title,
  subtitle,
  showYearSelector = false,
  actions,
  width = "default",
  padded = true,
}: AppShellProps) => {
  const pathname = usePathname();
  const { permissions, modules } = usePermissions();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close the drawer on navigation (render-time adjustment, no effect).
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setMobileOpen(false);
  }

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
    } catch {
      // Storage blocked: keep the expanded default.
    }
  }, []);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, c ? "0" : "1");
      } catch {
        // ignore
      }
      return !c;
    });
  };

  const backHref = useMemo(
    () => parentNavHref(pathname, visibleNavigation(permissions, modules)),
    [pathname, permissions, modules],
  );

  return (
    <div className="min-h-screen bg-color-bg-main">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-200 focus:rounded-radius-md focus:bg-color-bg-card focus:px-4 focus:py-2 focus:shadow-shadow-strong"
      >
        Zum Inhalt springen
      </a>

      <Sidebar
        collapsed={collapsed}
        onToggleCollapsed={toggleCollapsed}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
      />

      <div
        className={`flex min-h-screen flex-col transition-[padding] duration-200 ease-out ${
          collapsed ? "lg:pl-[4.25rem]" : "lg:pl-[15.5rem]"
        }`}
      >
        <HeaderHome
          pageTitle={title}
          pageSubtitle={subtitle}
          showYearSelector={showYearSelector}
          backHref={backHref}
          onMenuClick={() => setMobileOpen(true)}
          actions={actions}
        />

        <main id="main-content" className="flex flex-1 flex-col">
          <div
            className={`mx-auto w-full flex-1 ${widthClasses[width]} ${
              padded ? "px-4 py-6 sm:px-6 lg:px-8 lg:py-8" : ""
            } pb-24 lg:pb-8`}
          >
            {children}
          </div>
          <MiniFooter />
        </main>
      </div>
    </div>
  );
};
