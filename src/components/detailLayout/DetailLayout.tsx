import type { ReactNode } from "react";

/**
 * Header card for one record (lead, customer, person): name, id/meta line,
 * a primary action on the right and optional content underneath (stepper).
 */
export const RecordHeader = ({
  title,
  meta,
  badge,
  action,
  children,
}: {
  title: ReactNode;
  meta?: ReactNode;
  badge?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
}) => (
  <header className="ui-card flex flex-col gap-4 p-4 sm:p-6 animate-fade-in">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="text-[1.375rem] font-semibold tracking-tight text-color-text-main">
            {title}
          </h1>
          {badge}
        </div>
        {meta && <p className="text-sm text-color-text-subtle">{meta}</p>}
      </div>
      {action && <div className="flex flex-wrap items-center gap-2">{action}</div>}
    </div>
    {children}
  </header>
);

/**
 * Two-column record page: the work area (activities, history) on the left,
 * a sticky column of facts and small edit cards on the right. One column
 * on smaller screens, facts first.
 */
export const DetailLayout = ({
  header,
  main,
  aside,
}: {
  header: ReactNode;
  main: ReactNode;
  aside: ReactNode;
}) => (
  <div className="flex flex-col gap-5">
    {header}
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_22rem] xl:grid-cols-[minmax(0,1fr)_24rem]">
      <div className="order-2 flex min-w-0 flex-col gap-5 lg:order-1">{main}</div>
      <aside className="order-1 flex flex-col gap-4 lg:sticky lg:top-20 lg:order-2">
        {aside}
      </aside>
    </div>
  </div>
);
