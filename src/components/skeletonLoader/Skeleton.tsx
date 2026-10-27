/** Shimmer placeholder block. Size it with className (h-*, w-*). */
export const Skeleton = ({ className = "" }: { className?: string }) => (
  <div aria-hidden="true" className={`skeleton ${className}`} />
);

/** Card-shaped skeleton: a title line and a few text lines. */
export const SkeletonCard = ({ lines = 2 }: { lines?: number }) => (
  <div className="ui-card flex flex-col gap-3 p-5">
    <Skeleton className="h-5 w-2/5" />
    {Array.from({ length: lines }).map((_, i) => (
      <Skeleton key={i} className={`h-3.5 ${i % 2 ? "w-3/5" : "w-full"}`} />
    ))}
  </div>
);
