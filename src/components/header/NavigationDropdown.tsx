"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { usePermissions } from "../../hooks/permissions/usePermissions";
import { moduleForPath } from "../../data/salesModules";

type NavigationDropdownProps = {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
};

const navigationLinks = [
  { label: "Home", to: "/" },
  { label: "Einnahmen", to: "/einnahmen" },
  {
    label: "Steuerrelevante Ausgaben",
    to: "/steuerrelevante-ausgaben",
  },
  { label: "Statistiken", to: "/statistiken" },
  { label: "Analysen", to: "/analysen" },
];

const isActivePath = (pathname: string, to: string) => {
  if (to === "/") return pathname === to;
  return pathname === to || pathname.startsWith(`${to}/`);
};

export const NavigationDropdown = ({
  isOpen,
  setIsOpen,
}: NavigationDropdownProps) => {
  const pathname = usePathname();
  const { modules } = usePermissions();
  const [isVisible, setIsVisible] = useState(false);
  const [isAnimatingOut, setIsAnimatingOut] = useState(false);

  // Open/close transitions via render adjustment; only the exit timer
  // (an actual external system) lives in an effect.
  if (isOpen && (!isVisible || isAnimatingOut)) {
    setIsVisible(true);
    setIsAnimatingOut(false);
  } else if (!isOpen && isVisible && !isAnimatingOut) {
    setIsAnimatingOut(true);
  }

  useEffect(() => {
    if (!isAnimatingOut) return;
    const timer = setTimeout(() => {
      setIsVisible(false);
      setIsAnimatingOut(false);
    }, 150);
    return () => clearTimeout(timer);
  }, [isAnimatingOut]);

  if (!isVisible) return null;

  // Sales modules appear only when their feature flags are on and the user
  // may use them (src/data/salesModules.ts). Most specific match wins, so
  // "/vertrieb" isn't highlighted on "/vertrieb/produktion".
  const salesLinks = modules.map((m) => ({ label: m.label, to: m.href }));
  const activeSalesHref = moduleForPath(pathname)?.href;
  const salesHrefs = new Set(salesLinks.map((l) => l.to));

  return (
    <div
      role="menu"
      className={`absolute right-0 top-full mt-2 w-56 md:w-72 max-w-[calc(100vw-2rem)] rounded-radius-md border border-color-border-light bg-color-bg-dark shadow-shadow-medium z-50 overflow-hidden ${
        isAnimatingOut ? "animate-slide-up-out" : "animate-slide-down"
      }`}
    >
      <nav className="flex flex-col py-1.5 md:py-2">
        {[...navigationLinks, ...salesLinks].map((link) => {
          const isActive = salesHrefs.has(link.to)
            ? activeSalesHref === link.to
            : isActivePath(pathname, link.to);

          return (
            <Link
              key={link.to}
              href={link.to}
              role="menuitem"
              onClick={() => setIsOpen(false)}
              className={`px-3 py-2.5 md:px-4 md:py-3 text-xs md:text-sm no-underline transition-all duration-200 ease-in-out ${
                isActive
                  ? "bg-color-primary/15 text-color-primary"
                  : "text-color-text-subtle hover:bg-color-primary/20 hover:text-color-text-main"
              }`}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
};
