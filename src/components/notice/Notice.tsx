import type { ReactNode } from "react";
import {
  AlertCircleIcon,
  AlertTriangleIcon,
  CheckCircleIcon,
  InfoIcon,
} from "../icons";

type Tone = "info" | "warning" | "error" | "success";

const toneClasses: Record<Tone, { box: string; icon: string; title: string }> = {
  info: {
    box: "border-color-info/25 bg-color-bg-info-subtle",
    icon: "text-color-info-text",
    title: "text-color-info-text",
  },
  warning: {
    box: "border-color-warning/30 bg-color-bg-warning-subtle",
    icon: "text-color-warning-text",
    title: "text-color-warning-text",
  },
  error: {
    box: "border-color-error-border/30 bg-color-bg-error-subtle",
    icon: "text-color-error-text",
    title: "text-color-error-text",
  },
  success: {
    box: "border-color-success/30 bg-color-success/8",
    icon: "text-color-success-text",
    title: "text-color-success-text",
  },
};

const icons = {
  info: InfoIcon,
  warning: AlertTriangleIcon,
  error: AlertCircleIcon,
  success: CheckCircleIcon,
};

/** Inline callout for hints, provisional rules and required steps. */
export const Notice = ({
  tone = "info",
  title,
  children,
  action,
  compact = false,
}: {
  tone?: Tone;
  /** Bold lead-in, rendered inline before the text. */
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
}) => {
  const Icon = icons[tone];
  const t = toneClasses[tone];
  return (
    <div
      role="note"
      className={`flex items-start gap-2.5 rounded-radius-md border text-sm text-color-text-secondary animate-fade-in ${t.box} ${
        compact ? "px-3 py-2" : "px-4 py-3"
      }`}
    >
      <Icon size={compact ? 16 : 18} className={`mt-px shrink-0 ${t.icon}`} />
      <p className="min-w-0 flex-1 leading-relaxed text-color-text-secondary">
        {title && <span className={`font-semibold ${t.title}`}>{title}</span>}
        {title && " "}
        {children}
        {action && <> {action}</>}
      </p>
    </div>
  );
};
