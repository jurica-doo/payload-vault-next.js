import { HighlightText } from "../highlightText/HighlightText";
import type { TitleSideProps } from "./ContentCard.types";

export const TitleSide = ({
  title,
  subtitle,
  date,
  Icon,
  searchQuery,
}: TitleSideProps) => {
  return (
    <div className="flex min-w-0 items-center gap-3 sm:gap-3.5">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-radius-md bg-color-bg-accent-subtle text-color-text-accent transition-transform duration-200 group-hover:scale-105">
        <Icon className="h-5 w-5" />
      </span>

      <div className="flex min-w-0 flex-col gap-0.5">
        <h3 className="truncate text-[0.9375rem] font-semibold leading-snug text-color-text-main">
          <HighlightText text={title} highlight={searchQuery} />
        </h3>

        {subtitle ? (
          <p className="truncate text-[0.8125rem] leading-snug text-color-text-subtle">
            {subtitle}
          </p>
        ) : (
          date && (
            <p className="text-[0.8125rem] leading-snug text-color-text-subtle">
              {date}
            </p>
          )
        )}
      </div>
    </div>
  );
};
