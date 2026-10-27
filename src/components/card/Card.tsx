import type { ElementType, ReactNode } from "react";

type CardProps = {
  children: ReactNode;
  className?: string;
  /** Hover lift + pointer, for cards that are links or buttons. */
  interactive?: boolean;
  padding?: "none" | "sm" | "md";
  as?: ElementType;
};

const paddingClasses = {
  none: "",
  sm: "p-4",
  md: "p-4 sm:p-5",
};

/** Base surface: white/raised card with a hairline border. */
export const Card = ({
  children,
  className = "",
  interactive = false,
  padding = "md",
  as: Tag = "div",
}: CardProps) => (
  <Tag
    className={`ui-card ${paddingClasses[padding]} ${
      interactive ? "interactive-card cursor-pointer" : ""
    } ${className}`}
  >
    {children}
  </Tag>
);

type SectionCardProps = {
  title?: ReactNode;
  description?: ReactNode;
  /** Right-aligned header slot: one small action or a status badge. */
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
  /** Removes body padding, e.g. for an edge-to-edge table. */
  flush?: boolean;
  id?: string;
};

/**
 * Card with a header row (title, description, actions) — the standard
 * container for a block of content on every page.
 */
export const SectionCard = ({
  title,
  description,
  actions,
  children,
  className = "",
  flush = false,
  id,
}: SectionCardProps) => (
  <section
    id={id}
    className={`ui-card flex flex-col animate-fade-in ${className}`}
  >
    {(title || actions) && (
      <header
        className={`flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-4 pt-4 sm:px-5 sm:pt-5 ${
          flush ? "pb-4 border-b border-color-border-light" : ""
        }`}
      >
        <div className="flex min-w-0 flex-col gap-0.5">
          {title && (
            <h2 className="text-[0.9375rem] font-semibold leading-snug text-color-text-main">
              {title}
            </h2>
          )}
          {description && (
            <p className="text-[0.8125rem] leading-snug text-color-text-subtle">
              {description}
            </p>
          )}
        </div>
        {actions && (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {actions}
          </div>
        )}
      </header>
    )}
    <div
      className={
        flush
          ? "flex flex-col"
          : `flex flex-col gap-3 px-4 pb-4 sm:px-5 sm:pb-5 ${
              title || actions ? "pt-3" : "pt-4 sm:pt-5"
            }`
      }
    >
      {children}
    </div>
  </section>
);
