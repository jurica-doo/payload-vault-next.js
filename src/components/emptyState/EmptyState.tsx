import type { ComponentType, ReactNode } from "react";
import { InboxIcon } from "../icons";
import type { IconProps } from "../icons/Icon.types";

interface EmptyStateProps {
  message?: string;
  hint?: string;
  icon?: ComponentType<IconProps>;
  /** Optional call to action (usually a <Button>). */
  action?: ReactNode;
  /** Tighter spacing for use inside cards. */
  compact?: boolean;
}

export const EmptyState = ({
  message = "Keine Dokumente gefunden",
  hint,
  icon: Icon = InboxIcon,
  action,
  compact = false,
}: EmptyStateProps) => {
  return (
    <div
      className={`flex flex-col items-center justify-center px-4 text-center animate-fade-in ${
        compact ? "py-8" : "py-14"
      }`}
    >
      <span
        className={`mb-4 flex items-center justify-center rounded-full bg-color-bg-alt text-color-text-subtle ring-8 ring-color-bg-alt/40 ${
          compact ? "h-11 w-11" : "h-14 w-14"
        }`}
      >
        <Icon size={compact ? 20 : 24} />
      </span>
      <p className="text-[0.9375rem] font-semibold text-color-text-main">
        {message}
      </p>
      {hint && (
        <p className="mt-1 max-w-md text-sm text-color-text-subtle">{hint}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
};
