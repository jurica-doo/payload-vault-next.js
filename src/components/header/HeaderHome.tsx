"use client";

import { useState, useEffect, useRef, useMemo, type RefObject } from "react";
import { Dropdown } from "../dropdown/Dropdown";
import { ArrowBackIcon, UserIcon } from "../icons";
import { MenuDropdown } from "./MenuDropdown";
import { NavigationDropdown } from "./NavigationDropdown";
import { useAuth } from "../../context/AuthContext";
import { useYear } from "../../hooks/year/UseYear";
import { useRouter } from "next/navigation";

type HeaderHomeProps = {
  isTwoHeaders?: boolean;
  isSticky?: boolean;
  pageTitle?: string;
  pageSubtitle?: string;
  scrollContainerRef?: RefObject<HTMLElement | null>;
};

export const HeaderHome = ({
  isTwoHeaders = false,
  isSticky = true,
  pageTitle,
  pageSubtitle,
  scrollContainerRef,
}: HeaderHomeProps) => {
  const { user } = useAuth();
  const { year, setYear, availableYears } = useYear();
  const router = useRouter();

  const options = useMemo(
    () =>
      availableYears.map((y) => ({
        label: y.toString(),
        id: y.toString(),
      })),
    [availableYears],
  );

  const selectedYear = useMemo(
    () => ({
      id: year.toString(),
      label: year.toString(),
    }),
    [year],
  );

  const handleYearChange = (option: { id: string; label: string }) => {
    setYear(Number(option.id));
  };

  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isNavigationOpen, setIsNavigationOpen] = useState(false);
  const [isBrandCollapsed, setIsBrandCollapsed] = useState(false);
  type Theme = "light" | "dark";
  const hasPageHeader = isTwoHeaders;

  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window === "undefined") return "dark";
    return (document.documentElement.dataset.theme as Theme) ?? "dark";
  });

  const toggleTheme = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);

    document.documentElement.dataset.theme = next;
    localStorage.setItem("theme", next);
  };

  const menuRef = useRef<HTMLDivElement | null>(null);
  const navigationRef = useRef<HTMLDivElement | null>(null);

  const handleMenuOpen = () => {
    setIsNavigationOpen(false);
    setIsUserMenuOpen((value) => !value);
  };

  const handleNavigationOpen = () => {
    setIsUserMenuOpen(false);
    setIsNavigationOpen((value) => !value);
  };

  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Element;

      if (!(target.closest?.("[data-menu-wrapper]"))) {
        setIsUserMenuOpen(false);
      }

      if (!(target.closest?.("[data-nav-wrapper]"))) {
        setIsNavigationOpen(false);
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsUserMenuOpen(false);
        setIsNavigationOpen(false);
      }
    };

    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const scrollElement = scrollContainerRef?.current;

    const getScrollTop = () => {
      if (scrollElement) return scrollElement.scrollTop;
      return window.scrollY;
    };

    const updateCollapsedState = () => {
      if (window.innerWidth >= 768) {
        setIsBrandCollapsed(false);
        return;
      }

      setIsBrandCollapsed(getScrollTop() > 24);
    };

    updateCollapsedState();

    const scrollTarget: HTMLElement | Window = scrollElement ?? window;
    scrollTarget.addEventListener("scroll", updateCollapsedState, {
      passive: true,
    });
    window.addEventListener("resize", updateCollapsedState);

    return () => {
      scrollTarget.removeEventListener("scroll", updateCollapsedState);
      window.removeEventListener("resize", updateCollapsedState);
    };
  }, [scrollContainerRef]);

  const brandBlock = (
    <div
      className="flex items-center gap-4 min-w-0 hover:cursor-pointer"
      onClick={() => router.push("/")}
    >
      <div className="flex items-center justify-center shrink-0">
        {theme === "dark" ? (
          <img
            src="/profinaLogo.svg"
            alt="Profina logo"
            className="w-30 md:w-32 lg:w-36"
          />
        ) : (
          <img
            src="/profinaLogoLight.svg"
            alt="Profina logo"
            className="w-30 md:w-32 lg:w-36"
          />
        )}
      </div>

      <div className="flex flex-col min-w-0">
        <h5 className="leading-tight text-color-primary/90">
          <span className="text-color-primary font-semibold">Profina</span>{" "}
          Payload Vault
        </h5>

        <p className="text-[14px] sm:text-[16px] text-color-text-secondary truncate">
          {user?.email}
        </p>
      </div>
    </div>
  );

  const controlsBlock = (
    <>
      <div className="w-28 sm:w-40 md:w-36 lg:w-40">
        <Dropdown
          options={options}
          value={selectedYear}
          onSelect={handleYearChange}
        />
      </div>

      <div className="relative shrink-0" data-nav-wrapper ref={navigationRef}>
        <button
          className="cursor-pointer p-2 rounded-radius-md hover:bg-color-primary/20 hover:text-color-primary transition-all duration-200 ease-in-out active:scale-95"
          aria-label={
            isNavigationOpen ? "Navigation schließen" : "Navigation öffnen"
          }
          aria-haspopup="menu"
          aria-expanded={isNavigationOpen}
          type="button"
          onClick={handleNavigationOpen}
        >
          <span className="relative flex h-6 w-6 items-center justify-center text-color-text-secondary">
            <span
              className={`absolute block h-0.5 w-5 rounded-full bg-current transition-all duration-300 ease-in-out ${
                isNavigationOpen ? "rotate-45" : "-translate-y-1.5"
              }`}
            />
            <span
              className={`absolute block h-0.5 w-5 rounded-full bg-current transition-all duration-200 ease-in-out ${
                isNavigationOpen ? "opacity-0 scale-x-0" : "opacity-100"
              }`}
            />
            <span
              className={`absolute block h-0.5 w-5 rounded-full bg-current transition-all duration-300 ease-in-out ${
                isNavigationOpen ? "-rotate-45" : "translate-y-1.5"
              }`}
            />
          </span>
        </button>

        <NavigationDropdown
          isOpen={isNavigationOpen}
          setIsOpen={setIsNavigationOpen}
        />
      </div>

      <div className="relative shrink-0" data-menu-wrapper ref={menuRef}>
        <button
          className="cursor-pointer p-2 rounded-radius-md hover:bg-color-primary/20 hover:text-color-primary transition-all duration-200 ease-in-out active:scale-95"
          aria-label="Benutzermenü"
          aria-haspopup="menu"
          aria-expanded={isUserMenuOpen}
          type="button"
          onClick={handleMenuOpen}
        >
          <UserIcon className="w-7 h-7 sm:w-8 sm:h-8 text-color-text-secondary" />
        </button>

        <MenuDropdown
          isOpen={isUserMenuOpen}
          setIsOpen={setIsUserMenuOpen}
          theme={theme}
          toggleTheme={toggleTheme}
        />
      </div>
    </>
  );

  const handleBackNavigation = () => {
    router.back();

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        scrollContainerRef?.current?.scrollTo({ top: 0, left: 0 });
        window.scrollTo({ top: 0, left: 0 });
      });
    });
  };

  const pageTitleBlock = hasPageHeader ? (
    <div className="flex items-center gap-3 min-w-0">
      <button
        className="w-10 h-10 sm:w-11 sm:h-11 flex items-center justify-center shrink-0 cursor-pointer hover:text-color-primary hover:bg-color-primary/20 rounded-full transition-all duration-200 ease-in-out active:scale-90"
        onClick={handleBackNavigation}
      >
        <ArrowBackIcon className="w-5 h-5 sm:w-6 sm:h-6" />
      </button>

      <div className="flex flex-col min-w-0">
        <h5 className="leading-tight truncate">{pageTitle}</h5>

        {pageSubtitle && (
          <p className="text-[13px] sm:text-[15px] text-color-text-secondary truncate">
            {pageSubtitle}
          </p>
        )}
      </div>
    </div>
  ) : null;

  const mobileBrandWrapperClass = `overflow-hidden transition-all duration-300 ease-in-out md:hidden ${
    isBrandCollapsed
      ? "max-h-0 opacity-0 -translate-y-3 pointer-events-none"
      : "max-h-28 opacity-100 translate-y-0"
  }`;

  const mobileControlsRowClass = `border-color-border-light/40 px-4 py-3 sm:px-6 md:hidden ${
    hasPageHeader ? "border-t" : "border-t border-b"
  }`;

  return (
    <header
      className={`${isSticky ? "sticky top-0 z-40" : ""} bg-color-bg-main border-b-color-border-light border-b-2`}
    >
      <div className={mobileBrandWrapperClass}>
        <div className="px-4 pt-3 pb-3 sm:px-6">{brandBlock}</div>
      </div>

      <div className={mobileControlsRowClass}>
        <div className="flex items-center justify-end gap-1.5">
          {controlsBlock}
        </div>
      </div>

      {hasPageHeader && (
        <div className="px-4 pt-1 pb-3 sm:px-6 md:hidden">
          <div className="flex items-center justify-start min-w-0">
            {pageTitleBlock}
          </div>
        </div>
      )}

      {hasPageHeader ? (
        <div className="hidden md:flex items-center justify-between gap-6 px-6 py-3 lg:px-10">
          <div className="flex items-center gap-6 min-w-0 flex-1">
            <div className="shrink-0">{brandBlock}</div>
            <div className="h-12 w-px bg-color-border-light/70 shrink-0" />
            <div className="min-w-0">{pageTitleBlock}</div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {controlsBlock}
          </div>
        </div>
      ) : (
        <div
          className="
            hidden md:flex
            items-center justify-between gap-3
            px-4 py-3
            sm:px-6
            md:px-10 md:py-3
          "
        >
          {brandBlock}

          <div
            className="
              flex items-center gap-3
              w-full
              md:w-auto
              md:justify-end
            "
          >
            {controlsBlock}
          </div>
        </div>
      )}
    </header>
  );
};
