import Decimal from "decimal.js";
import { formatPoints, toDecimal, type NumericInput } from "../../utils/format";

type Marker = { value: NumericInput; label: string };

/**
 * Progress toward a requirement, e.g. career points or KV points (§7.4).
 * Use one meter per requirement; career progress shows total and KV points
 * side by side so a KV shortfall is visible even when the total is reached.
 *
 * - `markers` draw reference lines (e.g. the 50 % structure cap).
 * - `expected` is where a linear pace would be today; the label says whether
 *   the current pace is enough.
 * - Achieved values above the requirement are capped at 100 % visually but the
 *   number shows the real value.
 */
export const ProgressMeter = ({
  label,
  achieved,
  required,
  unit = "P",
  markers = [],
  expected,
}: {
  label: string;
  achieved: NumericInput;
  required: NumericInput;
  unit?: string;
  markers?: Marker[];
  expected?: NumericInput;
}) => {
  const a = toDecimal(achieved) ?? new Decimal(0);
  const r = toDecimal(required);
  const hasRequirement = r !== null && r.isPositive();

  const pct = (v: Decimal) =>
    hasRequirement ? Decimal.min(Decimal.max(v.div(r).times(100), 0), 100).toNumber() : 100;

  const percent = pct(a);
  const isMet = hasRequirement ? a.gte(r) : true;
  const remaining = hasRequirement ? Decimal.max(r.minus(a), 0) : new Decimal(0);
  const e = toDecimal(expected);
  const onPace = e === null ? null : a.gte(e);

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-semibold text-color-text-main">{label}</span>
        <span className="tabular-nums text-color-text-secondary">
          {formatPoints(a)} / {hasRequirement ? formatPoints(r) : "–"} {unit}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(percent)}
        className="relative h-3 w-full overflow-hidden rounded-full bg-color-bg-dark"
      >
        <div
          className={`h-full rounded-full transition-all duration-500 ${isMet ? "bg-color-success-border" : "bg-color-primary"}`}
          style={{ width: `${percent}%` }}
        />
        {markers.map((m) => {
          const v = toDecimal(m.value);
          if (v === null) return null;
          return (
            <span
              key={m.label}
              title={m.label}
              data-testid="progress-marker"
              className="absolute top-0 h-full w-0.5 bg-color-secondary"
              style={{ left: `${pct(v)}%` }}
            />
          );
        })}
        {e !== null && (
          <span
            title="Soll-Stand heute"
            className="absolute top-0 h-full w-0.5 bg-color-text-main/60"
            style={{ left: `${pct(e)}%` }}
          />
        )}
      </div>
      <div className="flex flex-wrap justify-between gap-x-3 text-xs text-color-text-subtle">
        <span>
          {isMet ? "Erreicht" : `Noch ${formatPoints(remaining)} ${unit}`}
        </span>
        {onPace !== null && !isMet && (
          <span className={onPace ? "text-color-success-text" : "text-color-error-text"}>
            {onPace ? "Im Plan" : "Hinter Plan"}
          </span>
        )}
      </div>
    </div>
  );
};
