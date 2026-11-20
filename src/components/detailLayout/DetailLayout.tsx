import type { ReactNode } from "react";
import { ButtonLink } from "../button/ButtonLink";
import { MailIcon, PhoneIcon } from "../icons";

/**
 * Header card for one record (lead, customer, person): name, id/meta line,
 * a primary action on the right and optional content underneath (stepper).
 */
export const RecordHeader = ({
  title,
  meta,
  badge,
  action,
  contact,
  children,
}: {
  title: ReactNode;
  meta?: ReactNode;
  badge?: ReactNode;
  action?: ReactNode;
  /** One-tap call / e-mail for the record (most useful on phones). */
  contact?: { phone?: string | null; email?: string | null };
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
    {(contact?.phone || contact?.email) && (
      <div className="flex flex-wrap gap-2">
        {contact.phone && <ButtonLink href={`tel:${contact.phone}`} text="Anrufen" icon={PhoneIcon} />}
        {contact.email && <ButtonLink href={`mailto:${contact.email}`} text="E-Mail schreiben" icon={MailIcon} />}
      </div>
    )}
    {children}
  </header>
);

/**
 * Two-column record page: the work area (activities, history) on the left,
 * a sticky column of facts and small edit cards on the right. On phones one
 * column, work area first (call/e-mail sit in the header), facts below.
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
    <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-5 lg:grid-cols-[minmax(0,1fr)_22rem] xl:grid-cols-[minmax(0,1fr)_24rem]">
      <div className="flex min-w-0 flex-col gap-5">{main}</div>
      <aside className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-20">
        {aside}
      </aside>
    </div>
  </div>
);
