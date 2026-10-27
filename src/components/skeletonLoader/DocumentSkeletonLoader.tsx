import { Skeleton } from "./Skeleton";

export const DocumentSkeletonLoader = () => {
  return (
    <div
      role="status"
      aria-label="Dokumente werden geladen"
      className="flex w-full flex-col gap-3"
    >
      {Array.from({ length: 6 }).map((_, idx) => (
        <div key={idx} className="ui-card flex items-center gap-4 p-4">
          <Skeleton className="h-10 w-10 shrink-0 rounded-radius-md" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-3/5" />
            <Skeleton className="h-3 w-2/5" />
          </div>
          <Skeleton className="hidden h-8 w-24 sm:block" />
        </div>
      ))}
    </div>
  );
};
