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
      className="flex flex-col gap-1 rounded-radius-lg bg-color-bg-card p-4 shadow-shadow-soft"
    >
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-sm text-color-text-subtle">{label}</h4>
        {isEstimate && (
          <span className="rounded-full border border-color-secondary/40 px-2 text-xs text-color-secondary">
            Schätzung
          </span>
        )}
      </div>
      <div className="text-2xl font-bold text-color-text-main">
        {isLoading ? (
          <span className="inline-block h-7 w-24 animate-pulse rounded-radius-sm bg-color-bg-dark" />
        ) : (
          value
        )}
      </div>
      {delta && !isLoading && (
        <p className={`text-xs ${deltaClass}`}>
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
