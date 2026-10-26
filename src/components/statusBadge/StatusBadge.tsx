export type BadgeTone = "neutral" | "info" | "success" | "warning" | "error";

export type StatusMap<S extends string> = Record<S, { label: string; tone: BadgeTone }>;

const toneClasses: Record<BadgeTone, string> = {
  neutral: "bg-color-bg-dark text-color-text-secondary border-color-border-light",
  info: "bg-color-bg-accent-subtle text-color-text-accent border-color-primary/40",
  success: "bg-color-success/15 text-color-success-text border-color-success-border/40",
  warning: "bg-color-secondary/15 text-color-secondary border-color-secondary/40",
  error: "bg-color-bg-error-subtle text-color-error-text border-color-error-border/40",
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
      className={`inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-semibold ${toneClasses[tone]}`}
    >
      {entry?.label ?? status}
    </span>
  );
}
