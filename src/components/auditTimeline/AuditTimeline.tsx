import type { ReactNode } from "react";
import { EMPTY_VALUE, formatDateTime } from "../../utils/format";

export type AuditChange = { field: string; label?: string; from: ReactNode; to: ReactNode };

export type AuditEntry = {
  id: string;
  at: string; // ISO timestamp
  actorName: string | null; // null = system (cron, trigger)
  action: string;
  reason?: string | null;
  changes?: AuditChange[];
};

/** Change history for one record (§12.3: actor, time, old → new, reason). */
export const AuditTimeline = ({
  entries,
  emptyMessage = "Keine Änderungen protokolliert.",
}: {
  entries: AuditEntry[];
  emptyMessage?: string;
}) => {
  if (entries.length === 0) {
    return <p className="text-sm text-color-text-subtle">{emptyMessage}</p>;
  }

  return (
    <ol className="relative flex flex-col gap-4 border-l border-color-border-light pl-4">
      {entries.map((entry) => (
        <li key={entry.id} className="relative">
          <span
            aria-hidden
            className="absolute top-1.5 -left-[21px] h-2.5 w-2.5 rounded-full bg-color-primary"
          />
          <p className="text-sm text-color-text-main">
            <span className="font-semibold">{entry.actorName ?? "System"}</span>{" "}
            {entry.action}
          </p>
          <time dateTime={entry.at} className="text-xs text-color-text-subtle">
            {formatDateTime(entry.at)}
          </time>
          {entry.reason && (
            <p className="mt-1 text-sm text-color-text-secondary">
              <span className="text-color-text-subtle">Begründung: </span>
              {entry.reason}
            </p>
          )}
          {entry.changes && entry.changes.length > 0 && (
            <dl className="mt-1 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 text-xs">
              {entry.changes.map((c) => (
                <div key={c.field} className="contents">
                  <dt className="text-color-text-subtle">{c.label ?? c.field}</dt>
                  <dd className="break-words text-color-text-secondary">
                    <del className="text-color-error-text">{c.from ?? EMPTY_VALUE}</del>
                    {" → "}
                    <ins className="text-color-success-text no-underline">{c.to ?? EMPTY_VALUE}</ins>
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </li>
      ))}
    </ol>
  );
};
