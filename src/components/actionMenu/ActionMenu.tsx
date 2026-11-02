"use client";

import {
  type ComponentType,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { DotsIcon } from "../icons";
import type { IconProps } from "../icons/Icon.types";

export type ActionMenuItem = {
  label: string;
  onClick: () => void;
  icon?: ComponentType<IconProps>;
  /** Destructive actions are tinted red and listed last. */
  danger?: boolean;
  disabled?: boolean;
  hidden?: boolean;
};

type ActionMenuProps = {
  items: ActionMenuItem[];
  /** Accessible name of the trigger, e.g. "Aktionen für Lead Müller". */
  label?: string;
  /** Custom trigger content; defaults to a ⋯ icon button. */
  trigger?: ReactNode;
  align?: "left" | "right";
};

/** Gap between trigger and menu, and minimum distance to the viewport edge. */
const GAP = 4;
const EDGE = 8;

type Position = { top: number; left?: number; right?: number; up: boolean };

/**
 * Overflow menu for secondary row/card actions. Keeps tables and cards
 * calm: one visible primary action, the rest behind "⋯".
 *
 * The menu renders in a portal with fixed positioning, so scroll boxes
 * (wide tables, cards) never clip it: it opens below the trigger, or above
 * when there is no room, and follows the trigger while anything scrolls.
 */
export const ActionMenu = ({
  items,
  label = "Weitere Aktionen",
  trigger,
  align = "right",
}: ActionMenuProps) => {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<Position | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuId = useId();
  const visible = items.filter((i) => !i.hidden);

  // Closed menus forget their place (render-time reset, no effect).
  if (!open && pos) setPos(null);

  // Measure after render (menu is invisible until placed), then keep it
  // attached to the trigger on any scroll (capture: inner scroll boxes too).
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const trigger = triggerRef.current?.getBoundingClientRect();
      const menu = menuRef.current;
      if (!trigger || !menu) return;
      const height = menu.offsetHeight;
      const below = window.innerHeight - trigger.bottom - GAP - EDGE;
      const up = below < height && trigger.top - GAP - EDGE > below;
      const top = up ? trigger.top - GAP - height : trigger.bottom + GAP;
      setPos(
        align === "right"
          ? { top, right: Math.max(EDGE, window.innerWidth - trigger.right), up }
          : { top, left: Math.max(EDGE, trigger.left), up },
      );
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open, align]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!wrapperRef.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Focus the first item once the menu is placed (no scroll jump to 0,0).
  const placed = pos !== null;
  useEffect(() => {
    if (!placed) return;
    menuRef.current
      ?.querySelector<HTMLButtonElement>('[role="menuitem"]:not([disabled])')
      ?.focus({ preventScroll: true });
  }, [placed]);

  if (visible.length === 0) return null;

  const onMenuKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const nodes = Array.from(
      e.currentTarget.querySelectorAll<HTMLButtonElement>(
        '[role="menuitem"]:not([disabled])',
      ),
    );
    const idx = nodes.indexOf(document.activeElement as HTMLButtonElement);
    const next =
      e.key === "ArrowDown"
        ? (idx + 1) % nodes.length
        : (idx - 1 + nodes.length) % nodes.length;
    nodes[next]?.focus();
  };

  return (
    <div ref={wrapperRef} className="relative inline-flex">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        aria-label={trigger ? undefined : label}
        className={
          trigger
            ? "inline-flex cursor-pointer rounded-radius-md transition-all duration-150 hover:brightness-[0.97] active:scale-[0.97]"
            : `inline-flex h-8 min-w-8 cursor-pointer items-center justify-center gap-1 rounded-radius-md px-1.5 text-color-text-subtle transition-all duration-150 hover:bg-color-bg-hover hover:text-color-text-main active:scale-95 ${
                open ? "bg-color-bg-hover text-color-text-main" : ""
              }`
        }
      >
        {trigger ?? <DotsIcon size={18} />}
      </button>
      {open && createPortal(
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          onKeyDown={onMenuKey}
          onClick={(e) => e.stopPropagation()}
          style={pos ? { top: pos.top, left: pos.left, right: pos.right } : { top: 0, left: 0 }}
          className={`fixed z-90 min-w-48 rounded-radius-lg bg-color-surface-raised p-1 shadow-shadow-strong ring-1 ring-color-border-light ${
            !pos ? "invisible" : pos.up ? "origin-bottom animate-slide-up" : "origin-top animate-slide-down"
          }`}
        >
          {visible.map((item, i) => {
            const Icon = item.icon;
            const prevSafe = i > 0 && !visible[i - 1].danger;
            return (
              <div key={item.label}>
                {item.danger && prevSafe && (
                  <div className="my-1 h-px bg-color-border-light" />
                )}
                <button
                  type="button"
                  role="menuitem"
                  disabled={item.disabled}
                  onClick={() => {
                    setOpen(false);
                    item.onClick();
                  }}
                  className={`flex w-full cursor-pointer items-center gap-2.5 rounded-radius-md px-2.5 py-2 text-left text-sm transition-colors duration-100 disabled:cursor-not-allowed disabled:opacity-50 ${
                    item.danger
                      ? "text-color-error-text hover:bg-color-bg-error-subtle focus:bg-color-bg-error-subtle"
                      : "text-color-text-main hover:bg-color-bg-hover focus:bg-color-bg-hover"
                  } focus:outline-none`}
                >
                  {Icon && <Icon size={16} className="h-4 w-4 shrink-0 opacity-80" />}
                  {item.label}
                </button>
              </div>
            );
          })}
        </div>,
        document.body,
      )}
    </div>
  );
};
