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
    <div
      className={`flex items-center min-w-0
        transition-colors duration-200 ease-in-out`}
    >
      <Icon className="w-7 h-7 sm:w-8 sm:h-8 text-color-icon mr-3 sm:mr-4 shrink-0" />

      <div className="flex flex-col gap-1 sm:gap-2 min-w-0">
        <h3 className="text-[16px] font-semibold truncate">
          <HighlightText text={title} highlight={searchQuery} />
        </h3>

        {subtitle ? (
          <p className="text-[14px] text-color-text-secondary truncate">
            {subtitle}
          </p>
        ) : (
          date && (
            <p className="text-[14px] text-color-text-secondary">{date}</p>
          )
        )}
      </div>
    </div>
  );
};
