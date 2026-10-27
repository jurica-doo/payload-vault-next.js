import type { ReactNode } from "react";

type Tone = "primary" | "accent" | "neutral";

const barClasses: Record<Tone, string> = {
  primary: "bg-color-primary",
  accent: "bg-color-secondary",
  neutral: "bg-color-border-strong",
};

/** Heading for a page section (h2), with an optional right-hand slot. */
export const SectionHeading = ({
  children,
  description,
  actions,
  tone = "primary",
}: {
  children: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  tone?: Tone;
}) => (
  <div className="flex flex-wrap items-end justify-between gap-3">
    <div className="flex min-w-0 flex-col gap-0.5">
      <div className="flex items-center gap-2.5">
        <span aria-hidden className={`h-4 w-1 rounded-full ${barClasses[tone]}`} />
        <h2 className="text-[1.0625rem] font-semibold text-color-text-main">
          {children}
        </h2>
      </div>
      {description && (
        <p className="pl-3.5 text-[0.8125rem] text-color-text-subtle">
          {description}
        </p>
      )}
    </div>
    {actions && <div className="flex items-center gap-2">{actions}</div>}
  </div>
);
