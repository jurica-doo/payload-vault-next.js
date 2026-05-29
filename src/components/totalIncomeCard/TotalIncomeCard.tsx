import { IncomeIcon, LossIcon } from "../icons";
import type { TotalIncomeCardProps } from "./TotalIncomeCard.types";
import { normalizeProfit } from "../contentCard/ContentCard.utils";

export const TotalIncomeCard = ({
  title,
  totalIncome,
  subtitle,
  variant = "income",
}: TotalIncomeCardProps) => {
  return (
    <div
      className={`${variant === "income" ? "bg-color-bg-accent-subtle" : "bg-color-bg-error-subtle"} rounded-radius-lg flex p-5 justify-center transition-all duration-200 ease-in-out hover:shadow-shadow-medium`}
    >
      <div className="w-[95%] flex flex-col items-baseline gap-1">
        <h4 className="text-color-text-subtle">{title}</h4>
        <h3
          className={`${variant === "income" ? "text-color-primary" : "text-color-error"}`}
        >
          {normalizeProfit(totalIncome)} €
        </h3>
        {subtitle && <p>{subtitle}</p>}
      </div>
      <div className="flex justify-center">
        {variant === "income" ? (
          <IncomeIcon className="text-color-primary w-14 lg:w-18" />
        ) : (
          <LossIcon className="text-color-error w-14 lg:w-18" />
        )}
      </div>
    </div>
  );
};
