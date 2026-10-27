"use client";

import {
  type ComponentType,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
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

/**
 * Overflow menu for secondary row/card actions. Keeps tables and cards
 * calm: one visible primary action, the rest behind "⋯".
 */
export const ActionMenu = ({
  items,
  label = "Weitere Aktionen",
  trigger,
  align = "right",
}: ActionMenuProps) => {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const menuId = useId();
  const visible = items.filter((i) => !i.hidden);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    wrapperRef.current
      ?.querySelector<HTMLButtonElement>('[role="menuitem"]:not([disabled])')
      ?.focus();
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

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
      {open && (
        <div
          id={menuId}
          role="menu"
          onKeyDown={onMenuKey}
          onClick={(e) => e.stopPropagation()}
          className={`absolute top-full z-50 mt-1 min-w-48 origin-top rounded-radius-lg bg-color-surface-raised p-1 shadow-shadow-strong ring-1 ring-color-border-light animate-slide-down ${
            align === "right" ? "right-0" : "left-0"
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
                  {Icon && <Icon size={16} className="shrink-0 opacity-80" />}
                  {item.label}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
