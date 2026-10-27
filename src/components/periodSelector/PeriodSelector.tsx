"use client";

import { SegmentedToggle } from "../segmentedToggle/SegmentedToggle";
import { DateInput } from "../formFields/FormFields";
import { formatDate } from "../../utils/format";

export type CareerPeriodOption = { id: string; label: string; start: string; end: string };

export type Period =
  | { kind: "month"; year: number; month: number } // month 1–12
  | { kind: "year"; year: number }
  | { kind: "career"; periodId: string }
  | { kind: "range"; from: string; to: string }; // inclusive dates, YYYY-MM-DD

const MONTHS = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];

/**
 * Half-open date range [start, end) for a period, matching how the database
 * stores career periods (OD-01). "range" is inclusive in the UI, so its end
 * is moved one day forward here.
 */
export function periodToRange(
  period: Period,
  careerPeriods: CareerPeriodOption[] = [],
): { start: string; end: string } | null {
  const pad = (n: number) => String(n).padStart(2, "0");
  switch (period.kind) {
    case "month": {
      const nextYear = period.month === 12 ? period.year + 1 : period.year;
      const nextMonth = period.month === 12 ? 1 : period.month + 1;
      return { start: `${period.year}-${pad(period.month)}-01`, end: `${nextYear}-${pad(nextMonth)}-01` };
    }
    case "year":
      return { start: `${period.year}-01-01`, end: `${period.year + 1}-01-01` };
    case "career": {
      const p = careerPeriods.find((c) => c.id === period.periodId);
      return p ? { start: p.start, end: p.end } : null;
    }
    case "range": {
      if (!period.from || !period.to || period.from > period.to) return null;
      const d = new Date(`${period.to}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() + 1);
      return { start: period.from, end: d.toISOString().slice(0, 10) };
    }
  }
}

export const PeriodSelector = ({
  value,
  onChange,
  careerPeriods = [],
  years,
}: {
  value: Period;
  onChange: (period: Period) => void;
  careerPeriods?: CareerPeriodOption[];
  years: number[];
}) => {
  const kinds = [
    { value: "month" as const, label: "Monat" },
    { value: "year" as const, label: "Jahr" },
    ...(careerPeriods.length ? [{ value: "career" as const, label: "Karriereperiode" }] : []),
    { value: "range" as const, label: "Zeitraum" },
  ];
  const fallbackYear = years[0] ?? new Date().getFullYear();
  const currentYear = "year" in value ? value.year : fallbackYear;
  const select =
    "ui-input w-auto";

  const switchKind = (kind: Period["kind"]) => {
    if (kind === "month") onChange({ kind, year: currentYear, month: 1 });
    else if (kind === "year") onChange({ kind, year: currentYear });
    else if (kind === "career") onChange({ kind, periodId: careerPeriods[0]?.id ?? "" });
    else onChange({ kind, from: `${currentYear}-01-01`, to: `${currentYear}-12-31` });
  };

  const rangeInvalid = value.kind === "range" && periodToRange(value) === null;

  return (
    <div className="flex flex-col gap-3">
      <SegmentedToggle options={kinds} value={value.kind} onChange={switchKind} ariaLabel="Zeitraumart" />

      <div className="flex flex-wrap items-end gap-2">
        {(value.kind === "month" || value.kind === "year") && (
          <select
            aria-label="Jahr"
            className={select}
            value={value.year}
            onChange={(e) => onChange({ ...value, year: Number(e.target.value) })}
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        )}
        {value.kind === "month" && (
          <select
            aria-label="Monat"
            className={select}
            value={value.month}
            onChange={(e) => onChange({ ...value, month: Number(e.target.value) })}
          >
            {MONTHS.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
        )}
        {value.kind === "career" && (
          <select
            aria-label="Karriereperiode"
            className={select}
            value={value.periodId}
            onChange={(e) => onChange({ kind: "career", periodId: e.target.value })}
          >
            {careerPeriods.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label} ({formatDate(p.start)} – {formatDate(p.end)})
              </option>
            ))}
          </select>
        )}
        {value.kind === "range" && (
          <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
            <DateInput label="Von" value={value.from} onChange={(from) => onChange({ ...value, from })} />
            <DateInput
              label="Bis"
              value={value.to}
              min={value.from}
              onChange={(to) => onChange({ ...value, to })}
              error={rangeInvalid ? "„Bis“ muss nach „Von“ liegen." : undefined}
            />
          </div>
        )}
      </div>
    </div>
  );
};
