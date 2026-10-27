"use client";

import { EmptyState } from "../../components/emptyState/EmptyState";
import { KpiTile } from "../../components/kpiTile/KpiTile";
import { usePermissions } from "../../hooks/permissions/usePermissions";
import { useActivitySummary } from "../../hooks/useActivities/useActivities";
import { berlinToday, formatPercent, safeRatio } from "../../utils/format";
import { ActivityPanel } from "./ActivityPanel";

/** First day of the Berlin month and of the next one, as [from, to). */
export function monthWindow(today = berlinToday()) {
  const [y, m] = today.split("-").map(Number);
  const pad = (n: number) => String(n).padStart(2, "0");
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${pad(m + 1)}-01`;
  return { from: `${y}-${pad(m)}-01`, to: next };
}

/** Own activity log with this month's funnel counts (§8.2, §9.1). */
export const ActivitiesPage = () => {
  const { permissions } = usePermissions();
  const me = permissions.employeeId;
  const { from, to } = monthWindow();
  const { data: s, isLoading } = useActivitySummary(me, from, to);
  if (!me) return <EmptyState message="Aktivitäten gibt es nur für aktive Mitarbeitende." />;

  return (
    <div className="flex flex-col gap-4">
      <section aria-label="Dieser Monat" className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiTile label="Kontaktversuche" value={s?.contact_attempts ?? 0} isLoading={isLoading}
          hint={s ? `Erreichbarkeit ${formatPercent(safeRatio(s.reached, s.contact_attempts))} (erreicht ÷ Versuche)` : undefined} />
        <KpiTile label="Termine vereinbart" value={s?.appointments_booked ?? 0} isLoading={isLoading} hint={s ? `${s.upcoming_appointments} anstehend` : undefined} />
        <KpiTile label="Termine durchgeführt" value={s?.appointments_held ?? 0} isLoading={isLoading}
          hint={s ? `${s.no_shows} nicht erschienen` : undefined} />
        <KpiTile label="Angebote / Nachfassen" value={s ? `${s.offers} / ${s.followups}` : "–"} isLoading={isLoading} />
      </section>
      <p className="text-xs text-color-text-subtle">
        Zeitraum: aktueller Kalendermonat (Europe/Berlin). Vereinbart = im Monat angelegt, durchgeführt = Termin im Monat mit Ergebnis „durchgeführt“.
      </p>
      <section className="ui-card p-3">
        <h2 className="mb-2 text-sm font-semibold">Aktivitäten</h2>
        <ActivityPanel filter={{ ownerId: me }} />
      </section>
    </div>
  );
};
