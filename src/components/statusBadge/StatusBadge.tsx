export type BadgeTone = "neutral" | "info" | "success" | "warning" | "error";

export type StatusMap<S extends string> = Record<S, { label: string; tone: BadgeTone }>;

const toneClasses: Record<BadgeTone, string> = {
  neutral: "bg-color-bg-alt text-color-text-secondary ring-color-border-light",
  info: "bg-color-bg-info-subtle text-color-info-text ring-color-info/20",
  success: "bg-color-success/10 text-color-success-text ring-color-success/20",
  warning: "bg-color-bg-warning-subtle text-color-warning-text ring-color-warning/25",
  error: "bg-color-bg-error-subtle text-color-error-text ring-color-error-border/25",
};

const dotClasses: Record<BadgeTone, string> = {
  neutral: "bg-color-text-subtle",
  info: "bg-color-info",
  success: "bg-color-success-border",
  warning: "bg-color-warning",
  error: "bg-color-error-border",
};

/**
 * One badge for every status column (ledger, statements, goals, leads, …).
 * Each module passes its own StatusMap so labels and colours stay consistent
 * per domain. An unknown status still renders, as a neutral badge with the
 * raw value, rather than disappearing.
 */
export function StatusBadge<S extends string>({
  status,
  map,
}: {
  // Plain string: rows from the API may carry a status this map doesn't know yet.
  status: string;
  map: StatusMap<S>;
}) {
  const entry = (map as Record<string, { label: string; tone: BadgeTone }>)[status];
  const tone = entry?.tone ?? "neutral";
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${toneClasses[tone]}`}
    >
      <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${dotClasses[tone]}`} />
      {entry?.label ?? status}
    </span>
  );
}
