import { type KeyboardEvent, type ReactNode, useRef } from "react";

export type TabItem<T extends string> = {
  value: T;
  label: ReactNode;
  /** Optional counter shown as a small pill next to the label. */
  count?: number;
};

type TabsProps<T extends string> = {
  items: TabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel?: string;
  /** "segmented" for scope filters (Ich/Team), "underline" for sub-pages. */
  variant?: "segmented" | "underline";
  className?: string;
};

/**
 * One tab control for every view switch (scope filters, months, …). Arrow
 * keys move between tabs (WAI-ARIA tabs pattern, automatic activation).
 */
export function Tabs<T extends string>({
  items,
  value,
  onChange,
  ariaLabel,
  variant = "segmented",
  className = "",
}: TabsProps<T>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = items.length - 1;
    const next =
      e.key === "ArrowRight"
        ? index === last ? 0 : index + 1
        : e.key === "ArrowLeft"
          ? index === 0 ? last : index - 1
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? last
              : null;
    if (next === null) return;
    e.preventDefault();
    refs.current[next]?.focus();
    onChange(items[next].value);
  };

  const segmented = variant === "segmented";

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={`${
        segmented
          ? "inline-flex max-w-full flex-wrap items-center gap-0.5 rounded-radius-md bg-color-bg-alt p-0.5 ring-1 ring-inset ring-color-border-light"
          : "flex max-w-full gap-1 overflow-x-auto border-b border-color-border-light"
      } ${className}`}
    >
      {items.map((item, index) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            ref={(el) => {
              refs.current[index] = el;
            }}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(item.value)}
            onKeyDown={(e) => onKeyDown(e, index)}
            className={
              segmented
                ? `inline-flex h-8 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-[calc(var(--radius-md)-2px)] px-3 text-sm font-medium transition-all duration-150 active:scale-[0.97] ${
                    active
                      ? "bg-color-bg-card text-color-text-main shadow-shadow-soft"
                      : "text-color-text-subtle hover:text-color-text-main"
                  }`
                : `relative -mb-px inline-flex h-10 cursor-pointer items-center gap-1.5 whitespace-nowrap border-b-2 px-3 text-sm font-medium transition-colors duration-150 ${
                    active
                      ? "border-color-primary text-color-text-main"
                      : "border-transparent text-color-text-subtle hover:border-color-border-strong hover:text-color-text-main"
                  }`
            }
          >
            {item.label}
            {item.count !== undefined && (
              <span
                className={`tabular rounded-full px-1.5 text-[0.6875rem] leading-[1.125rem] ${
                  active
                    ? "bg-color-bg-accent-subtle text-color-text-accent"
                    : "bg-color-bg-hover text-color-text-subtle"
                }`}
              >
                {item.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
