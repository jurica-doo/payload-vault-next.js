import type { ReactNode } from "react";
import { formatPercent, toDecimal, type NumericInput } from "../../utils/format";

type Delta = {
  /** Relative change as a ratio (0.12 = +12 %). null → no comparison shown. */
  ratio: NumericInput;
  /** e.g. "ggü. Vormonat" — always say what the change is compared with. */
  comparedTo: string;
  /** Whether an increase is good (points) or bad (overdue tasks). */
  goodWhen?: "up" | "down";
};

export const KpiTile = ({
  label,
  value,
  hint,
  delta,
  isEstimate = false,
  isLoading = false,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  delta?: Delta;
  /** Forecasts must be labelled as estimates (§7.5). */
  isEstimate?: boolean;
  isLoading?: boolean;
}) => {
  const ratio = delta ? toDecimal(delta.ratio) : null;
  const direction = ratio === null || ratio.isZero() ? "flat" : ratio.isPositive() ? "up" : "down";
  const isGood =
    direction === "flat" ? null : direction === (delta?.goodWhen ?? "up");
  const deltaClass =
    isGood === null
      ? "text-color-text-subtle"
      : isGood
        ? "text-color-success-text"
        : "text-color-error-text";
  const arrow = direction === "up" ? "▲" : direction === "down" ? "▼" : "▬";

  return (
    <section
      aria-busy={isLoading}
      className="ui-card flex flex-col gap-1.5 p-4 sm:p-5 animate-fade-in"
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[0.8125rem] font-medium text-color-text-subtle">
          {label}
        </h3>
        {isEstimate && (
          <span className="rounded-full bg-color-bg-warning-subtle px-2 py-0.5 text-[0.6875rem] font-medium text-color-warning-text">
            Schätzung
          </span>
        )}
      </div>
      <div className="tabular text-2xl font-semibold tracking-tight text-color-text-main">
        {isLoading ? (
          <span className="skeleton inline-block h-7 w-24" />
        ) : (
          value
        )}
      </div>
      {delta && !isLoading && (
        <p className={`text-xs font-medium ${deltaClass}`}>
          {ratio === null ? (
            <span>Kein Vergleich {delta.comparedTo}</span>
          ) : (
            <>
              <span aria-hidden>{arrow} </span>
              {formatPercent(ratio.abs(), 0)} {delta.comparedTo}
            </>
          )}
        </p>
      )}
      {hint && <p className="text-xs text-color-text-subtle">{hint}</p>}
    </section>
  );
};
