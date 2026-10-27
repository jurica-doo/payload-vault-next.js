import { Skeleton } from "../skeletonLoader/Skeleton";

type LoadingStateProps = {
  /** Screen-reader text; visible only when `showLabel` is set. */
  label?: string;
  /** Number of placeholder rows. */
  rows?: number;
  showLabel?: boolean;
};

/**
 * Inline loading placeholder for a section or card. Replaces the plain
 * "Lädt…" text: a few shimmer rows shaped roughly like the content, so the
 * layout doesn't jump when data arrives.
 */
export const LoadingState = ({
  label = "Wird geladen…",
  rows = 3,
  showLabel = false,
}: LoadingStateProps) => (
  <div role="status" aria-live="polite" className="flex flex-col gap-2.5 py-2">
    <span className={showLabel ? "text-sm text-color-text-subtle" : "sr-only"}>
      {label}
    </span>
    {Array.from({ length: rows }).map((_, i) => (
      <Skeleton
        key={i}
        className={`h-4 ${i === 0 ? "w-2/3" : i % 2 ? "w-full" : "w-5/6"}`}
      />
    ))}
  </div>
);
