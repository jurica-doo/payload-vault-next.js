import { useMemo, useState } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import type { PdfRecord } from "../../hooks/usePdf/types";
import {
  buildIncomeForecastWithMeta,
  getForecastSummary,
} from "../../hooks/useAnalytics/forecastUtils";
import { normalizeProfit } from "../../components/contentCard/ContentCard.utils";

const FORECAST_COLOR = "#f59e0b"; // amber — visually distinct from primary

type IncomeForecastProps = {
  pdfs: PdfRecord[];
  previousYearPdfs?: PdfRecord[];
  year: number;
};

const LABEL_MAP: Record<string, string> = {
  actual: "Ist",
  forecast: "Prognose",
};

const CustomTooltip = ({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ dataKey?: string; value?: number; color?: string }>;
  label?: string;
}) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-color-bg-card border border-color-border-light rounded-radius-md px-3 py-2 shadow-shadow-medium">
      <p className="text-sm font-medium text-color-text-main">{label}</p>
      {payload
        .filter((e) => e.value != null && e.value > 0)
        .map((entry) => (
          <p
            key={entry.dataKey}
            className="text-sm font-semibold"
            style={{ color: entry.color }}
          >
            {LABEL_MAP[entry.dataKey ?? ""] ?? entry.dataKey}:{" "}
            {normalizeProfit(entry.value ?? 0)} €
          </p>
        ))}
    </div>
  );
};

/** Chevron icon that rotates when open */
const ChevronIcon = ({ open }: { open: boolean }) => (
  <svg
    className={`w-4 h-4 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth={2}
  >
    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
  </svg>
);

export const IncomeForecast = ({
  pdfs,
  previousYearPdfs,
  year,
}: IncomeForecastProps) => {
  const [infoOpen, setInfoOpen] = useState(false);

  const { data: forecastData, meta } = useMemo(
    () => buildIncomeForecastWithMeta(pdfs, year, previousYearPdfs),
    [pdfs, year, previousYearPdfs],
  );
  const summary = useMemo(
    () => getForecastSummary(forecastData),
    [forecastData],
  );

  const hasActualData = forecastData.some(
    (d) => d.actual !== null && d.actual > 0,
  );
  const hasForecastData = forecastData.some((d) => d.forecast !== null);

  // Find the transition point index
  const transitionIdx = forecastData.findIndex(
    (d) => d.actual !== null && d.forecast !== null,
  );

  return (
    <div className="bg-color-bg-card border border-color-border-light rounded-radius-lg p-4 sm:p-6 animate-fade-in">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <div>
          <h4 className="text-base sm:text-lg font-semibold text-color-text-main">
            Einnahmenprognose
          </h4>
          <p className="text-xs text-color-text-subtle mt-0.5">
            Kombinierte Prognose aus aktuellem Trend
            {meta.usedPreviousYear ? " & Vorjahres-Saisonmuster" : ""}
          </p>
        </div>
      </div>

      {!hasActualData ? (
        <div className="flex items-center justify-center h-48 text-color-text-subtle text-sm">
          Keine Daten für eine Prognose vorhanden
        </div>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
            <div className="bg-color-bg-main rounded-radius-md p-3">
              <span className="text-xs text-color-text-subtle uppercase tracking-wide">
                Bisherige Einnahmen
              </span>
              <p className="text-lg font-bold text-color-primary mt-0.5">
                {normalizeProfit(summary.totalActual)} €
              </p>
            </div>
            <div className="bg-color-bg-main rounded-radius-md p-3">
              <span className="text-xs text-color-text-subtle uppercase tracking-wide">
                Prognostiziert (Rest)
              </span>
              <p
                className="text-lg font-bold mt-0.5"
                style={{ color: FORECAST_COLOR }}
              >
                {hasForecastData
                  ? `${normalizeProfit(summary.totalForecast)} €`
                  : "–"}
              </p>
            </div>
            <div className="bg-color-bg-main rounded-radius-md p-3">
              <span className="text-xs text-color-text-subtle uppercase tracking-wide">
                Hochrechnung Gesamt
              </span>
              <p className="text-lg font-bold text-color-primary mt-0.5">
                {normalizeProfit(summary.projectedTotal)} €
              </p>
            </div>
          </div>

          {/* Chart */}
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart
              data={forecastData}
              margin={{ top: 5, right: 5, left: -15, bottom: 5 }}
            >
              <defs>
                <linearGradient
                  id="incomeActualGradient"
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop
                    offset="5%"
                    stopColor="var(--color-primary)"
                    stopOpacity={0.3}
                  />
                  <stop
                    offset="95%"
                    stopColor="var(--color-primary)"
                    stopOpacity={0}
                  />
                </linearGradient>
                <linearGradient
                  id="incomeForecastGradient"
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop
                    offset="5%"
                    stopColor={FORECAST_COLOR}
                    stopOpacity={0.15}
                  />
                  <stop
                    offset="95%"
                    stopColor={FORECAST_COLOR}
                    stopOpacity={0}
                  />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="var(--color-border-light)"
                opacity={0.3}
              />
              <XAxis
                dataKey="month"
                tick={{ fill: "var(--color-text-subtle)", fontSize: 12 }}
                axisLine={{ stroke: "var(--color-border-light)" }}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: "var(--color-text-subtle)", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) =>
                  `${(v / 1000).toFixed(v >= 1000 ? 0 : 1)}k`
                }
              />
              <Tooltip content={<CustomTooltip />} />
              {transitionIdx >= 0 && (
                <ReferenceLine
                  x={forecastData[transitionIdx].month}
                  stroke="var(--color-border-light)"
                  strokeDasharray="5 5"
                  label={{
                    value: "Heute",
                    position: "top",
                    fill: "var(--color-text-subtle)",
                    fontSize: 11,
                  }}
                />
              )}
              <Area
                type="monotone"
                dataKey="actual"
                stroke="var(--color-primary)"
                strokeWidth={2.5}
                fill="url(#incomeActualGradient)"
                dot={{
                  fill: "var(--color-primary)",
                  strokeWidth: 2,
                  r: 3,
                }}
                activeDot={{
                  r: 5,
                  strokeWidth: 0,
                  fill: "var(--color-primary)",
                }}
                connectNulls={false}
                animationDuration={800}
              />
              <Area
                type="monotone"
                dataKey="forecast"
                stroke={FORECAST_COLOR}
                strokeWidth={2.5}
                strokeDasharray="8 4"
                fill="url(#incomeForecastGradient)"
                dot={{ fill: FORECAST_COLOR, strokeWidth: 2, r: 4 }}
                activeDot={{ r: 6, strokeWidth: 0, fill: FORECAST_COLOR }}
                connectNulls={false}
                animationDuration={1000}
              />
            </AreaChart>
          </ResponsiveContainer>

          {/* Legend */}
          <div className="flex items-center justify-center gap-6 mt-3">
            <div className="flex items-center gap-1.5 text-xs text-color-text-subtle">
              <span className="w-3 h-0.5 bg-color-primary rounded-full inline-block" />
              Tatsächlich
            </div>
            <div className="flex items-center gap-1.5 text-xs text-color-text-subtle">
              <span
                className="w-3 h-0.5 rounded-full inline-block"
                style={{ background: FORECAST_COLOR }}
              />
              Prognose
              {meta.usedPreviousYear && (
                <span className="text-[10px] opacity-60">
                  (Trend + Vorjahr)
                </span>
              )}
            </div>
          </div>

          {/* Info Box */}
          <div className="mt-4 border border-color-border-light rounded-radius-md overflow-hidden">
            <button
              type="button"
              onClick={() => setInfoOpen((o) => !o)}
              className="flex items-center gap-2 w-full px-3 py-2.5 text-left text-xs text-color-text-subtle hover:bg-color-bg-main/50 transition-colors cursor-pointer"
            >
              <svg
                className="w-3.5 h-3.5 shrink-0 opacity-70"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <span className="font-medium">
                Wie wird die Prognose berechnet?
              </span>
              <ChevronIcon open={infoOpen} />
            </button>

            <div
              className={`grid transition-all duration-300 ease-in-out ${
                infoOpen
                  ? "grid-rows-[1fr] opacity-100"
                  : "grid-rows-[0fr] opacity-0"
              }`}
            >
              <div className="overflow-hidden">
                <div className="px-3 pb-3 pt-1 text-xs text-color-text-subtle space-y-3 leading-relaxed">
                  {/* Confidence badge */}
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${
                        meta.dataQuality === "high"
                          ? "bg-color-primary/15 text-color-primary"
                          : meta.dataQuality === "medium"
                            ? "bg-amber-500/15 text-amber-500"
                            : "bg-color-error/15 text-color-error"
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          meta.dataQuality === "high"
                            ? "bg-color-primary"
                            : meta.dataQuality === "medium"
                              ? "bg-amber-500"
                              : "bg-color-error"
                        }`}
                      />
                      {meta.dataQuality === "high"
                        ? "Hohe Datenqualität"
                        : meta.dataQuality === "medium"
                          ? "Mittlere Datenqualität"
                          : "Geringe Datenqualität"}
                    </span>
                    <span className="opacity-50 text-[10px]">
                      Konfidenz: {Math.round(meta.confidenceScore * 100)}%
                    </span>
                  </div>

                  {/* Data basis */}
                  <div className="flex flex-col gap-1">
                    <span className="font-semibold text-color-text-main text-[11px] uppercase tracking-wide">
                      Datengrundlage
                    </span>
                    <ul className="list-disc list-inside space-y-0.5 pl-1">
                      <li>
                        <span className="font-medium">
                          {meta.currentYearMonths}
                        </span>{" "}
                        {meta.currentYearMonths === 1 ? "Monat" : "Monate"} mit
                        Einnahmen im aktuellen Jahr
                        {meta.currentYearAvg > 0 && (
                          <span className="opacity-70">
                            {" "}
                            (Ø {normalizeProfit(meta.currentYearAvg)} €/Monat)
                          </span>
                        )}
                      </li>
                      {meta.usedPreviousYear && (
                        <li>
                          <span className="font-medium">
                            {meta.previousYearMonths}
                          </span>{" "}
                          {meta.previousYearMonths === 1 ? "Monat" : "Monate"}{" "}
                          mit Einnahmen im Vorjahr
                          {meta.previousYearAvg > 0 && (
                            <span className="opacity-70">
                              {" "}
                              (Ø {normalizeProfit(meta.previousYearAvg)}{" "}
                              €/Monat)
                            </span>
                          )}
                        </li>
                      )}
                    </ul>
                  </div>

                  {/* Methodology */}
                  <div className="flex flex-col gap-1">
                    <span className="font-semibold text-color-text-main text-[11px] uppercase tracking-wide">
                      Methodik
                    </span>
                    <p>{meta.weightingExplanation}</p>
                    {meta.trendSlope !== 0 && (
                      <p className="opacity-70">
                        Trend: {meta.trendSlope > 0 ? "+" : ""}
                        {normalizeProfit(meta.trendSlope)} €/Monat
                      </p>
                    )}
                  </div>

                  {/* Dynamic weighting visual */}
                  {meta.usedPreviousYear && (
                    <div className="flex flex-col gap-1.5">
                      <span className="font-semibold text-color-text-main text-[11px] uppercase tracking-wide">
                        Gewichtung
                      </span>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 rounded-full bg-color-bg-main overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${Math.round(meta.seasonalWeight * 100)}%`,
                              background: FORECAST_COLOR,
                            }}
                          />
                        </div>
                        <span className="text-[10px] whitespace-nowrap opacity-70">
                          {Math.round(meta.seasonalWeight * 100)}% Saisonal /{" "}
                          {Math.round(meta.trendWeight * 100)}% Trend
                        </span>
                      </div>
                      <p className="opacity-50 text-[10px]">
                        Passt sich automatisch an — mit mehr Monatsdaten steigt
                        der Trend-Anteil.
                      </p>
                    </div>
                  )}

                  <p className="opacity-60 italic text-[10px] border-t border-color-border-light pt-2">
                    Prognosen sind Schätzungen und können von tatsächlichen
                    Ergebnissen abweichen. Je mehr Daten vorhanden sind, desto
                    zuverlässiger die Hochrechnung.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
