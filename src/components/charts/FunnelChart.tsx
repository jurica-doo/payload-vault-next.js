import Decimal from "decimal.js";
import { formatPercent, safeRatio } from "../../utils/format";

export type FunnelStep = { id: string; label: string; count: number };

/**
 * Conversion funnel (§8.2, §9.4). Each step shows its count and the rate
 * relative to the previous step, and the caption always states the time
 * window and attribution rule — the spec requires the denominator to be
 * visible so a rate can't be misread.
 */
export const FunnelChart = ({
  steps,
  window,
  attributionNote,
}: {
  steps: FunnelStep[];
  /** e.g. "01.10.2026 – 31.10.2026" */
  window: string;
  attributionNote?: string;
}) => {
  const max = Math.max(0, ...steps.map((s) => s.count));

  return (
    <figure className="flex flex-col gap-2">
      <ol className="flex flex-col gap-1.5">
        {steps.map((step, index) => {
          const prev = index > 0 ? steps[index - 1] : null;
          const rate = prev ? safeRatio(step.count, prev.count) : null;
          const width = max > 0 ? new Decimal(step.count).div(max).times(100).toNumber() : 0;
          return (
            <li key={step.id} className="flex flex-col gap-0.5">
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="text-color-text-secondary">{step.label}</span>
                <span className="tabular-nums text-color-text-main">
                  {step.count}
                  {prev && (
                    <span className="ml-2 text-xs text-color-text-subtle">
                      {formatPercent(rate)} von {prev.count}
                    </span>
                  )}
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-color-bg-dark">
                <div className="h-full rounded-full bg-color-primary" style={{ width: `${width}%` }} />
              </div>
            </li>
          );
        })}
      </ol>
      <figcaption className="text-xs text-color-text-subtle">
        Zeitraum: {window}. Quote = Anzahl ÷ Anzahl der vorherigen Stufe.
        {attributionNote && ` ${attributionNote}`}
      </figcaption>
    </figure>
  );
};
