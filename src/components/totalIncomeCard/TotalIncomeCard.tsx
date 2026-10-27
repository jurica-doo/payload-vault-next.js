import { TrendIcon, ReceiptIcon } from "../icons";
import type { TotalIncomeCardProps } from "./TotalIncomeCard.types";
import { normalizeProfit } from "../contentCard/ContentCard.utils";

export const TotalIncomeCard = ({
  title,
  totalIncome,
  subtitle,
  variant = "income",
}: TotalIncomeCardProps) => {
  const isIncome = variant === "income";
  return (
    <div className="ui-card relative flex items-center justify-between gap-4 overflow-hidden p-5 sm:p-6 animate-fade-in">
      {/* Soft brand wash in the corner. */}
      <span
        aria-hidden
        className={`pointer-events-none absolute -right-10 -top-16 h-44 w-44 rounded-full blur-3xl ${
          isIncome ? "bg-color-primary/12" : "bg-color-secondary/12"
        }`}
      />
      <div className="relative flex min-w-0 flex-col gap-1">
        <span className="text-[0.8125rem] font-medium text-color-text-subtle">
          {title}
        </span>
        <span
          className={`tabular text-[1.75rem] font-semibold leading-tight tracking-tight sm:text-[2rem] ${
            isIncome ? "text-color-text-accent" : "text-color-text-main"
          }`}
        >
          {normalizeProfit(totalIncome)} €
        </span>
        {subtitle && (
          <span className="text-[0.8125rem] text-color-text-subtle">
            {subtitle}
          </span>
        )}
      </div>
      <span
        className={`relative flex h-12 w-12 shrink-0 items-center justify-center rounded-radius-lg ${
          isIncome
            ? "bg-color-bg-accent-subtle text-color-text-accent"
            : "bg-color-bg-warning-subtle text-color-warning-text"
        }`}
      >
        {isIncome ? <TrendIcon size={24} /> : <ReceiptIcon size={24} />}
      </span>
    </div>
  );
};
