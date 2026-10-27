"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Dropdown } from "../dropdown/Dropdown";
import { ChevronDownIcon, ChevronLeftIcon, MenuIcon } from "../icons";
import { MenuDropdown } from "./MenuDropdown";
import { useAuth } from "../../context/AuthContext";
import { useYear } from "../../hooks/year/UseYear";

type HeaderHomeProps = {
  pageTitle?: string;
  pageSubtitle?: string;
  /** The year filter belongs to the private vault; sales pages hide it. */
  showYearSelector?: boolean;
  /** Parent page for detail views; shown as a back link before the title. */
  backHref?: string;
  /** Opens the navigation drawer below lg. */
  onMenuClick?: () => void;
  /** Right-side slot before the year filter (primary page action, bell). */
  actions?: ReactNode;
};

const initialsOf = (email?: string | null) => {
  if (!email) return "?";
  const name = email.split("@")[0];
  const parts = name.split(/[._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
};

/**
 * Top bar of the app shell: page title (+ back link on detail pages), the
 * page's primary action, year filter, notifications and the user menu.
 * Deliberately no backdrop-filter/transform here — fixed children (the
 * mobile upload button) must stay relative to the viewport.
 */
export const HeaderHome = ({
  pageTitle,
  pageSubtitle,
  showYearSelector = true,
  backHref,
  onMenuClick,
  actions,
}: HeaderHomeProps) => {
  const { user } = useAuth();
  const { year, setYear, availableYears } = useYear();
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);

  const options = useMemo(
    () =>
      availableYears.map((y) => ({
        label: y.toString(),
        id: y.toString(),
      })),
    [availableYears],
  );

  const selectedYear = useMemo(
    () => ({ id: year.toString(), label: year.toString() }),
    [year],
  );

  useEffect(() => {
    if (!isUserMenuOpen) return;
    const onMouseDown = (e: MouseEvent) => {
      if (!(e.target as Element).closest?.("[data-menu-wrapper]")) {
        setIsUserMenuOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsUserMenuOpen(false);
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isUserMenuOpen]);

  return (
    <header className="sticky top-0 z-40 border-b border-color-border-light bg-color-bg-main/95 pt-[env(safe-area-inset-top)] supports-[backdrop-filter]:bg-color-bg-main/90">
      <div className="flex h-14 items-center gap-2 px-3 sm:gap-3 sm:px-6 lg:px-8">
        {onMenuClick && (
          <button
            type="button"
            onClick={onMenuClick}
            aria-label="Navigation öffnen"
            className="-ml-1 flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-radius-md text-color-text-secondary transition-all duration-150 hover:bg-color-bg-hover hover:text-color-text-main active:scale-90 lg:hidden"
          >
            <MenuIcon size={20} />
          </button>
        )}

        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          {backHref && (
            <Link
              href={backHref}
              aria-label="Zurück zur übergeordneten Seite"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-radius-md text-color-text-subtle no-underline transition-all duration-150 hover:bg-color-bg-hover hover:text-color-text-main hover:no-underline active:scale-90"
            >
              <ChevronLeftIcon size={18} />
            </Link>
          )}
          <div className="flex min-w-0 flex-col">
            {pageTitle && (
              <span className="truncate text-[0.9375rem] font-semibold leading-tight text-color-text-main">
                {pageTitle}
              </span>
            )}
            {pageSubtitle && (
              <span className="truncate text-xs leading-tight text-color-text-subtle">
                {pageSubtitle}
              </span>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          {actions}

          {showYearSelector && (
            <div className="w-24 sm:w-28" aria-label="Jahr auswählen">
              <Dropdown
                options={options}
                value={selectedYear}
                onSelect={(o) => setYear(Number(o.id))}
              />
            </div>
          )}

          <div className="relative" data-menu-wrapper>
            <button
              className={`flex h-9 cursor-pointer items-center gap-1.5 rounded-full pl-0.5 pr-1.5 transition-all duration-150 hover:bg-color-bg-hover active:scale-95 ${
                isUserMenuOpen ? "bg-color-bg-hover" : ""
              }`}
              aria-label="Benutzermenü"
              aria-haspopup="menu"
              aria-expanded={isUserMenuOpen}
              type="button"
              onClick={() => setIsUserMenuOpen((v) => !v)}
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-color-bg-accent-subtle text-xs font-semibold text-color-text-accent ring-1 ring-inset ring-color-primary/20">
                {initialsOf(user?.email)}
              </span>
              <ChevronDownIcon
                size={14}
                className={`hidden text-color-text-subtle transition-transform duration-200 sm:block ${
                  isUserMenuOpen ? "rotate-180" : ""
                }`}
              />
            </button>

            <MenuDropdown
              isOpen={isUserMenuOpen}
              setIsOpen={setIsUserMenuOpen}
              email={user?.email ?? undefined}
            />
          </div>
        </div>
      </div>
    </header>
  );
};
