"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo } from "react";
import { usePermissions } from "../../hooks/permissions/usePermissions";
import {
  activeNavHref,
  visibleNavigation,
  type NavItem,
} from "../../data/navigation";
import { ChevronLeftIcon, XIcon } from "../icons";

type SidebarProps = {
  /** Desktop icon rail. */
  collapsed: boolean;
  onToggleCollapsed: () => void;
  /** Mobile drawer state. */
  mobileOpen: boolean;
  onCloseMobile: () => void;
};

const Brand = ({ collapsed }: { collapsed: boolean }) => (
  <Link
    href="/"
    aria-label="Profina Payload Vault – zur Übersicht"
    className="flex min-w-0 items-center gap-2.5 rounded-radius-md no-underline hover:no-underline"
  >
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src="/favicon.svg" alt="" className="h-8 w-8 shrink-0 rounded-radius-md" />
    {!collapsed && (
      <span className="flex min-w-0 flex-col leading-tight animate-fade-in">
        <span className="truncate text-sm font-semibold text-color-text-main">
          Profina
        </span>
        <span className="truncate text-[0.6875rem] font-medium uppercase tracking-wider text-color-text-subtle">
          Payload Vault
        </span>
      </span>
    )}
  </Link>
);

const NavLink = ({
  item,
  active,
  collapsed,
  sub = false,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
  sub?: boolean;
  onNavigate: () => void;
}) => {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      title={collapsed ? item.label : undefined}
      onClick={onNavigate}
      className={`group relative flex items-center gap-3 rounded-radius-md no-underline transition-all duration-150 ease-out hover:no-underline active:scale-[0.98] ${
        sub ? "h-8 pl-[2.375rem] pr-2.5 text-[0.8125rem]" : "h-9 px-2.5 text-sm"
      } ${collapsed ? "justify-center px-0" : ""} ${
        active
          ? "bg-color-bg-accent-subtle font-semibold text-color-text-accent"
          : "font-medium text-color-text-secondary hover:bg-color-bg-hover hover:text-color-text-main"
      }`}
    >
      {active && !sub && (
        <span
          aria-hidden
          className="absolute -left-3 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-color-primary animate-fade-in"
        />
      )}
      {sub && (
        <span
          aria-hidden
          className={`absolute left-[1.3rem] top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full transition-colors ${
            active ? "bg-color-primary" : "bg-color-border-strong group-hover:bg-color-text-subtle"
          }`}
        />
      )}
      {Icon && !sub && (
        <Icon
          size={18}
          className={`shrink-0 transition-transform duration-150 group-hover:scale-105 ${
            active ? "text-color-primary" : "text-color-icon group-hover:text-color-text-main"
          }`}
        />
      )}
      <span className={collapsed ? "sr-only" : "truncate"}>{item.label}</span>
    </Link>
  );
};

/**
 * App navigation. Desktop (lg+): fixed sidebar, collapsible to an icon rail.
 * Below lg: the same element slides in as a drawer. One <nav> in the DOM, so
 * links exist once for assistive tech.
 */
export const Sidebar = ({
  collapsed,
  onToggleCollapsed,
  mobileOpen,
  onCloseMobile,
}: SidebarProps) => {
  const pathname = usePathname();
  const { permissions, modules } = usePermissions();
  const groups = useMemo(
    () => visibleNavigation(permissions, modules),
    [permissions, modules],
  );
  const activeHref = activeNavHref(pathname, groups);
  // The rail only applies on desktop; the drawer always shows labels.
  const rail = collapsed && !mobileOpen;

  return (
    <>
      {mobileOpen && (
        <div
          aria-hidden
          onClick={onCloseMobile}
          className="fixed inset-0 z-50 bg-color-overlay backdrop-blur-[2px] animate-fade-in lg:hidden"
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex flex-col border-r border-color-border-light bg-color-bg-card pt-[env(safe-area-inset-top)] transition-[width,transform] duration-200 ease-out lg:translate-x-0 ${
          mobileOpen ? "translate-x-0 shadow-shadow-strong" : "-translate-x-full"
        } w-[17rem] ${collapsed ? "lg:w-[4.25rem]" : "lg:w-[15.5rem]"}`}
      >
        <div
          className={`flex h-14 shrink-0 items-center border-b border-color-border-light ${
            rail ? "lg:justify-center lg:px-0" : ""
          } justify-between px-4`}
        >
          <Brand collapsed={rail} />
          <button
            type="button"
            onClick={onCloseMobile}
            aria-label="Navigation schließen"
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-radius-md text-color-text-subtle transition-all hover:bg-color-bg-hover hover:text-color-text-main active:scale-90 lg:hidden"
          >
            <XIcon size={18} />
          </button>
        </div>

        <nav
          aria-label="Hauptnavigation"
          className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-4"
        >
          {groups.map((group, gi) => (
            <div key={group.id} className={gi > 0 ? "mt-5" : ""}>
              {rail ? (
                gi > 0 && <div className="mx-2 mb-3 h-px bg-color-border-light" />
              ) : (
                <p className="mb-1.5 px-2.5 text-[0.6875rem] font-semibold uppercase tracking-wider text-color-text-subtle">
                  {group.label}
                </p>
              )}
              <ul className="flex flex-col gap-0.5">
                {group.items.map((item) => {
                  const children = item.children ?? [];
                  const childActive = children.some((c) => c.href === activeHref);
                  const expanded =
                    !rail &&
                    children.length > 0 &&
                    (activeHref === item.href || childActive);
                  return (
                    <li key={item.href}>
                      <NavLink
                        item={item}
                        active={activeHref === item.href || (rail && childActive)}
                        collapsed={rail}
                        onNavigate={onCloseMobile}
                      />
                      {expanded && (
                        <ul className="relative mt-0.5 flex flex-col gap-0.5 animate-slide-down before:absolute before:bottom-2 before:left-[1.45rem] before:top-0 before:w-px before:bg-color-border-light">
                          {children.map((child) => (
                            <li key={child.href}>
                              <NavLink
                                item={child}
                                sub
                                active={activeHref === child.href}
                                collapsed={false}
                                onNavigate={onCloseMobile}
                              />
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="hidden shrink-0 border-t border-color-border-light p-3 lg:block">
          <button
            type="button"
            onClick={onToggleCollapsed}
            aria-label={collapsed ? "Navigation ausklappen" : "Navigation einklappen"}
            aria-pressed={collapsed}
            className={`flex h-9 w-full cursor-pointer items-center gap-3 rounded-radius-md px-2.5 text-sm font-medium text-color-text-subtle transition-all duration-150 hover:bg-color-bg-hover hover:text-color-text-main active:scale-[0.98] ${
              collapsed ? "justify-center px-0" : ""
            }`}
          >
            <ChevronLeftIcon
              size={18}
              className={`shrink-0 transition-transform duration-200 ${collapsed ? "rotate-180" : ""}`}
            />
            {!collapsed && <span>Einklappen</span>}
          </button>
        </div>
      </aside>
    </>
  );
};
