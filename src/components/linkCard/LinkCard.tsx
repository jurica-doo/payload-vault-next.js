import Link from "next/link";
import type { ComponentType, ReactNode } from "react";
import { ChevronRightIcon } from "../icons";
import type { IconProps } from "../icons/Icon.types";

type LinkCardProps = {
  href: string;
  title: ReactNode;
  description?: ReactNode;
  icon?: ComponentType<IconProps>;
  /** Right-aligned value, e.g. a total or a count badge. */
  meta?: ReactNode;
};

/** Clickable navigation card: icon, title, description, chevron. */
export const LinkCard = ({
  href,
  title,
  description,
  icon: Icon,
  meta,
}: LinkCardProps) => (
  <Link
    href={href}
    className="ui-card interactive-card group flex items-center gap-4 p-4 text-color-text-main no-underline hover:no-underline sm:p-5"
  >
    {Icon && (
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-radius-md bg-color-bg-accent-subtle text-color-text-accent transition-transform duration-200 group-hover:scale-105">
        <Icon size={20} />
      </span>
    )}
    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
      <span className="text-[0.9375rem] font-semibold leading-snug text-color-text-main">
        {title}
      </span>
      {description && (
        <span className="text-[0.8125rem] leading-snug text-color-text-subtle">
          {description}
        </span>
      )}
    </span>
    {meta && <span className="shrink-0 text-right">{meta}</span>}
    <ChevronRightIcon
      size={18}
      className="shrink-0 text-color-text-subtle transition-all duration-200 group-hover:translate-x-0.5 group-hover:text-color-primary"
    />
  </Link>
);
