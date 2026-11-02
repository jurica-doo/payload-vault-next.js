"use client";

import {
  type ComponentType,
  type KeyboardEvent,
  type SVGProps,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useAnchoredPosition } from "../popover/useAnchoredPosition";
import { DropdownList } from "./DropdownList";
import { ChevronDownIcon } from "../icons";
import { type DropdownProps, type Option } from "./Dropdown.types";
import { radiusVariants } from "./Dropdown.const";

const CLOSE_MS = 150;
/** Typing "k" then "f" within this time jumps to "Kf…" (native select behaviour). */
const TYPEAHEAD_RESET_MS = 600;

/**
 * The app's select. Replaces native <select> everywhere: same look in every
 * browser, and the list always opens below the field (above only when there
 * is no room), never over the current value the way macOS draws native ones.
 *
 * The list renders in a portal with fixed positioning, so modals and cards
 * cannot clip it. Focus stays on the field (aria-activedescendant), which
 * keeps modal focus traps intact. Keyboard: arrows, Home/End, Enter/Space,
 * Escape, Tab, and type-ahead; with search enabled, typing filters.
 */
export const Dropdown = ({
  options,
  value,
  onSelect,
  label,
  placeholder,
  isRequired,
  customIcon,
  isSearchEnabled = false,
  variant = "default",
  error,
  size = "md",
  placement = "bottom",
  ariaLabel,
  isDisabled = false,
}: DropdownProps) => {
  const id = useId();
  const listId = `${id}-list`;
  const optionId = (i: number) => `${id}-opt-${i}`;
  const [isOpen, setIsOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [search, setSearch] = useState("");
  const [active, setActive] = useState(0);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const typeahead = useRef({ text: "", at: 0 });

  const shown = isOpen || isClosing;
  const expanded = isOpen && !isClosing;
  const filtered =
    isSearchEnabled && search
      ? options.filter((o) => o.label.toLowerCase().includes(search.toLowerCase()))
      : options;
  const pos = useAnchoredPosition(shown, triggerRef, listRef, {
    prefer: placement,
    matchWidth: true,
    minWidth: size === "sm" ? 0 : 160,
  });

  /** Next selectable index from `from` in direction `dir` (stays put at the ends). */
  const step = (from: number, dir: 1 | -1) => {
    for (let i = from + dir; i >= 0 && i < filtered.length; i += dir) {
      if (!filtered[i].disabled) return i;
    }
    return from;
  };
  const firstEnabled = () => step(-1, 1);
  const lastEnabled = () => step(filtered.length, -1);

  const open = () => {
    if (isDisabled || shown) return;
    const selected = options.findIndex((o) => o.id === value?.id);
    setActive(selected >= 0 ? selected : firstEnabled());
    setIsOpen(true);
  };

  const close = (refocus = false) => {
    if (!isOpen || isClosing) return;
    setIsClosing(true);
    setTimeout(() => {
      setIsOpen(false);
      setIsClosing(false);
      setSearch("");
    }, CLOSE_MS);
    if (refocus) triggerRef.current?.focus({ preventScroll: true });
  };

  const choose = (option: Option | undefined) => {
    if (!option || option.disabled) return;
    onSelect(option);
    close(true);
  };

  const jumpTo = (char: string) => {
    const now = Date.now();
    const t = typeahead.current;
    t.text = now - t.at < TYPEAHEAD_RESET_MS ? t.text + char : char;
    t.at = now;
    const query = t.text.toLowerCase();
    // Repeating one letter cycles through the options starting with it.
    const cycling = query.length > 1 && [...query].every((c) => c === query[0]);
    const start = cycling ? active + 1 : 0;
    const rotated = [...filtered.slice(start), ...filtered.slice(0, start)];
    const hit = rotated.find((o) => !o.disabled && o.label.toLowerCase().startsWith(cycling ? query[0] : query));
    if (hit) setActive(filtered.indexOf(hit));
  };

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    const fromSearch = e.currentTarget === searchRef.current;
    if (!isOpen) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
        e.preventDefault();
        open();
      } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && !isSearchEnabled) {
        open();
        jumpTo(e.key);
      }
      return;
    }
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActive((i) => step(i, 1));
        return;
      case "ArrowUp":
        e.preventDefault();
        setActive((i) => step(i, -1));
        return;
      case "Home":
        if (fromSearch) return;
        e.preventDefault();
        setActive(firstEnabled());
        return;
      case "End":
        if (fromSearch) return;
        e.preventDefault();
        setActive(lastEnabled());
        return;
      case "Enter":
        e.preventDefault();
        choose(filtered[active]);
        return;
      case " ":
        if (fromSearch) return;
        e.preventDefault();
        choose(filtered[active]);
        return;
      case "Tab":
        close();
        return;
      default:
        if (!fromSearch && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) jumpTo(e.key);
    }
  };

  // Outside clicks close the list (it lives in a portal, so check both).
  // Escape is caught first (window, capture), wherever focus is, so it closes
  // only the list and never a surrounding modal.
  useEffect(() => {
    if (!expanded) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!triggerRef.current?.contains(target) && !listRef.current?.contains(target)) close();
    };
    const onEscape = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      close(true);
    };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onEscape, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onEscape, true);
    };
  });

  // Searchable lists take the focus for typing once placed.
  const placed = pos !== null;
  useEffect(() => {
    if (placed && isSearchEnabled) searchRef.current?.focus({ preventScroll: true });
  }, [placed, isSearchEnabled]);

  // Keep the highlighted option visible when it changes (keyboard, opening),
  // not on every render: that would undo the user's own scrolling.
  useEffect(() => {
    if (!expanded) return;
    document.getElementById(optionId(active))?.scrollIntoView?.({ block: "nearest" });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- optionId is derived from a stable id
  }, [expanded, active]);

  const MainIcon: ComponentType<SVGProps<SVGSVGElement>> | undefined = customIcon ?? value?.icon;
  const isPlaceholderActive = !value && !!placeholder;
  const displayText = isPlaceholderActive ? placeholder : (value?.label ?? "");

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label
          htmlFor={id}
          className="flex cursor-pointer items-center gap-0.5 text-[0.8125rem] font-medium text-color-text-secondary"
        >
          <span>{label}</span>
          {isRequired && (
            <span aria-hidden className="text-color-error-text">
              *
            </span>
          )}
        </label>
      )}
      <button
        ref={triggerRef}
        id={id}
        type="button"
        role="combobox"
        disabled={isDisabled}
        onClick={() => {
          // Safari does not focus buttons on click; the keyboard needs it.
          triggerRef.current?.focus({ preventScroll: true });
          if (isOpen) close();
          else open();
        }}
        onKeyDown={onKeyDown}
        aria-haspopup="listbox"
        aria-expanded={expanded}
        aria-controls={expanded ? listId : undefined}
        aria-activedescendant={expanded && !isSearchEnabled && filtered[active] ? optionId(active) : undefined}
        aria-label={ariaLabel}
        aria-required={isRequired || undefined}
        aria-invalid={error ? true : undefined}
        className={`flex w-full cursor-pointer items-center justify-between gap-2 text-left disabled:cursor-not-allowed disabled:opacity-60 ${
          size === "sm" ? "h-8 px-2.5" : "h-10 px-3"
        } ${radiusVariants[variant]} transition-[border-color,box-shadow,background-color] duration-150 ease-out ${
          expanded ? "border-color-primary! shadow-[0_0_0_3px_var(--color-focus-ring)]" : ""
        } ${
          error
            ? "border border-color-error-border bg-color-bg-card"
            : "border border-color-border-strong bg-color-bg-card enabled:hover:border-color-text-subtle"
        }`}
      >
        <span className="flex min-w-0 items-center gap-2.5">
          {MainIcon && <MainIcon className="h-[18px] w-[18px] shrink-0" />}
          <span
            className={`truncate text-sm leading-6 ${
              isPlaceholderActive ? "text-color-text-subtle" : "text-color-text-main"
            }`}
          >
            {displayText}
          </span>
        </span>
        <ChevronDownIcon
          size={16}
          className={`shrink-0 text-color-text-subtle transition-transform duration-200 ease-out ${
            expanded ? "rotate-180" : ""
          }`}
        />
      </button>

      {shown &&
        createPortal(
          <DropdownList
            ref={listRef}
            listId={listId}
            optionId={optionId}
            labelledBy={id}
            options={filtered}
            activeIndex={active}
            selectedId={value?.id}
            onHover={setActive}
            onChoose={choose}
            position={pos}
            isClosing={isClosing}
            isSearchEnabled={isSearchEnabled}
            searchRef={searchRef}
            searchValue={search}
            onSearchChange={(v) => {
              setSearch(v);
              setActive(0);
            }}
            onSearchKeyDown={onKeyDown}
          />,
          document.body,
        )}

      {error && <p className="text-[0.8125rem] text-color-error-text">{error}</p>}
    </div>
  );
};
