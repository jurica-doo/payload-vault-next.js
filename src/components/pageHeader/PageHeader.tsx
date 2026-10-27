import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronRightIcon } from "../icons";

export type Crumb = { label: string; href?: string };

type PageHeaderProps = {
  title: ReactNode;
  description?: ReactNode;
  breadcrumbs?: Crumb[];
  /** Right-hand slot: the page's single primary action (plus at most one
   *  secondary). Keep it short — one dominant CTA per screen. */
  actions?: ReactNode;
  /** Extra row below the title, e.g. Tabs or a filter toolbar. */
  children?: ReactNode;
};

export const PageHeader = ({
  title,
  description,
  breadcrumbs,
  actions,
  children,
}: PageHeaderProps) => (
  <div className="flex flex-col gap-4 animate-fade-in">
    {breadcrumbs && breadcrumbs.length > 0 && (
      <nav aria-label="Brotkrumen" className="-mb-2">
        <ol className="flex flex-wrap items-center gap-1 text-[0.8125rem] text-color-text-subtle">
          {breadcrumbs.map((c, i) => (
            <li key={`${c.label}-${i}`} className="flex items-center gap-1">
              {i > 0 && <ChevronRightIcon size={14} className="opacity-60" />}
              {c.href ? (
                <Link
                  href={c.href}
                  className="rounded-radius-sm px-0.5 text-color-text-subtle no-underline hover:text-color-text-main hover:no-underline"
                >
                  {c.label}
                </Link>
              ) : (
                <span aria-current="page" className="text-color-text-secondary">
                  {c.label}
                </span>
              )}
            </li>
          ))}
        </ol>
      </nav>
    )}
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="flex min-w-0 flex-col gap-1">
        <h1 className="text-[1.5rem] font-semibold tracking-tight text-color-text-main sm:text-[1.625rem]">
          {title}
        </h1>
        {description && (
          <p className="max-w-2xl text-sm text-color-text-subtle">
            {description}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      )}
    </div>
    {children}
  </div>
);
