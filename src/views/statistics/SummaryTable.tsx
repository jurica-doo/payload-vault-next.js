import type { SummaryStats } from "./utils";
import { normalizeProfit } from "../../components/contentCard/ContentCard.utils";

type SummaryTableProps = {
  stats: SummaryStats;
  variant: "income" | "expense";
};

export const SummaryTable = ({ stats, variant }: SummaryTableProps) => {
  const accentClass = variant === "income" ? "text-color-primary" : "text-color-error-text";
  const bgAccent = variant === "income" ? "bg-color-primary/5" : "bg-color-error/5";

  const rows = [
    { label: "Bester Monat", data: stats.bestMonth, icon: "+" },
    { label: "Schwächster Monat", data: stats.worstMonth, icon: "-" },
    { label: "Beste Kategorie", data: stats.bestCategory, icon: "+" },
    { label: "Schwächste Kategorie", data: stats.worstCategory, icon: "-" },
  ];

  const hasData = rows.some((r) => r.data !== null);

  return (
    <div className="bg-color-bg-card border border-color-border-light rounded-radius-lg p-4 sm:p-6 animate-fade-in">
      <h4 className="text-base sm:text-lg font-semibold text-color-text-main mb-4">
        Zusammenfassung
      </h4>

      {!hasData ? (
        <div className="flex items-center justify-center h-24 text-color-text-subtle text-sm">
          Keine Daten vorhanden
        </div>
      ) : (
        <div className="divide-y divide-color-border-light/50">
          {rows.map(
            (row) =>
              row.data && (
                <div
                  key={row.label}
                  className={`flex items-center justify-between py-3 px-2 -mx-2 rounded-radius-sm hover:${bgAccent} transition-colors duration-200`}
                >
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <span className="text-xs text-color-text-subtle uppercase tracking-wide">
                      {row.label}
                    </span>
                    <span className="text-sm font-medium text-color-text-main truncate">
                      {row.data.name}
                    </span>
                  </div>
                  <span className={`text-sm font-semibold ${accentClass} whitespace-nowrap ml-3`}>
                    {normalizeProfit(row.data.value)} €
                  </span>
                </div>
              ),
          )}
        </div>
      )}
    </div>
  );
};
