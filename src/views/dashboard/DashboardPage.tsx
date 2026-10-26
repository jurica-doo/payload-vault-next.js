"use client";

import Link from "next/link";
import { DataTable } from "../../components/dataTable/DataTable";
import { KpiTile } from "../../components/kpiTile/KpiTile";
import { ProgressMeter } from "../../components/progressMeter/ProgressMeter";
import { StatusBadge } from "../../components/statusBadge/StatusBadge";
import { TrendChart } from "../../components/charts/TrendChart";
import { EmptyState } from "../../components/emptyState/EmptyState";
import { AeValue, MoneyValue, PointsValue } from "../../components/values/Values";
import { usePermissions } from "../../hooks/permissions/usePermissions";
import {
  useAdminDashboard,
  useMyDashboard,
  useTeamDashboard,
  type AdminDashboard,
  type MyDashboard,
  type TeamDashboard,
} from "../../hooks/useDashboard/useDashboard";
import { formatDate, formatPoints, safeRatio, toDecimal } from "../../utils/format";
import { goalStatus } from "../goals/GoalsPage";
import { useCoaching } from "../../hooks/useCoaching/useCoaching";
import { historicalAverage, projectCareer, projectMonthEnd } from "../../domain/forecast";

const MONTHS = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
const monthShort = (iso: string) => MONTHS[Number(iso.slice(5, 7)) - 1];

/** Role-aware start page of the sales section (§7.3). */
export const DashboardPage = () => {
  const { permissions } = usePermissions();
  const isEmployee = !!permissions.employeeId;
  const me = useMyDashboard(isEmployee);
  const team = useTeamDashboard(isEmployee && permissions.isLeader);
  const admin = useAdminDashboard(permissions.isAdmin || permissions.isFinance);

  return (
    <div className="flex flex-col gap-6">
      {isEmployee && <MyActions employeeId={permissions.employeeId!} />}
      {isEmployee && (me.data ? <MySection d={me.data} /> : me.isLoading ? <p className="text-sm">Lädt…</p> : <EmptyState message="Dashboard nicht verfügbar." hint={me.error?.message} />)}
      {permissions.isLeader && team.data && <TeamSection d={team.data} />}
      {(permissions.isAdmin || permissions.isFinance) && admin.data && <AdminSection d={admin.data} />}
    </div>
  );
};

const delta = (actual: unknown, target: unknown) => {
  const r = safeRatio(toDecimal(actual as string), toDecimal(target as string));
  return r === null ? null : r.minus(1);
};

const MySection = ({ d }: { d: MyDashboard }) => {
  const target = d.goal?.targets.points;
  const c = d.career;
  // Estimates only (§7.5): shown with their method, never used for results.
  const monthEnd = projectMonthEnd(d.production.points, d.month, d.as_of);
  const average = historicalAverage(d.trend.map((t) => t.points));
  const careerFc =
    c.window_start && c.period_end && c.eligible !== null && c.required !== null
      ? projectCareer(c.eligible, c.required, c.window_start, c.period_end, d.as_of)
      : null;
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">Mein Monat</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile
          label="Punkte (anrechenbar)"
          value={<PointsValue value={d.production.points} />}
          delta={target !== undefined ? { ratio: delta(d.production.points, target), comparedTo: `ggü. Ziel ${formatPoints(target, 0)} P` } : undefined}
          hint={target === undefined ? "Kein Monatsziel hinterlegt" : undefined}
        />
        <KpiTile label="KV-Punkte" value={<PointsValue value={d.production.kv_points} isKv />} />
        <KpiTile label="AE" value={<AeValue value={d.production.ae} />} hint={`Jahr: ${formatPoints(d.year.points)} P`} />
        <KpiTile label="Provision nach Reserve" value={<MoneyValue value={d.commission.net} />} hint="In diesem Monat gebucht" />
      </div>

      {monthEnd && (
        <div className="grid gap-3 sm:grid-cols-2">
          <KpiTile
            label="Prognose Monatsende"
            isEstimate
            value={<PointsValue value={monthEnd.value} />}
            hint={`${monthEnd.method}${average ? ` · zum Vergleich ${formatPoints(average.value)} P (${average.method})` : ""}`}
            delta={target !== undefined ? { ratio: delta(monthEnd.value.toString(), target), comparedTo: "ggü. Ziel" } : undefined}
          />
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-3 rounded-radius-lg bg-color-bg-card p-4 shadow-shadow-soft">
          <h3 className="text-base font-semibold">Karriere</h3>
          {c.status === "in_progress" || c.status === "ready" ? (
            <>
              <ProgressMeter label={`${c.level} → ${c.target}`} achieved={c.eligible} required={c.required} expected={c.expected_now ?? undefined} />
              <ProgressMeter label="KV-Punkte" achieved={c.eligible_kv} required={c.kv_required} unit="KV-P" />
              {careerFc && (
                <p className="text-xs">
                  <span className="mr-1 rounded-full border border-color-secondary/40 px-2 text-color-secondary">Schätzung</span>
                  Bei gleichem Tempo ca. {formatPoints(careerFc.projected)} P zum Periodenende –{" "}
                  {careerFc.onTrack
                    ? "das reicht."
                    : careerFc.neededPerDay
                      ? `nötig wären ${formatPoints(careerFc.neededPerDay)} P pro Tag.`
                      : "im laufenden Zeitraum nicht mehr erreichbar."}
                  <span className="block text-color-text-subtle">{careerFc.method}</span>
                </p>
              )}
              <p className="text-xs text-color-text-subtle">
                Zeitraum bis {c.period_end ? formatDate(c.period_end) : "–"} (exklusiv). <Link href="/vertrieb/karriere">Details</Link>
              </p>
            </>
          ) : c.status === "top_level" ? (
            <p className="text-sm">Höchste Stufe erreicht.</p>
          ) : (
            <p className="text-sm text-color-text-subtle">Noch nicht berechenbar ({c.reason ?? c.status}).</p>
          )}
        </div>
        <div className="rounded-radius-lg bg-color-bg-card p-4 shadow-shadow-soft">
          <TrendChart
            caption="Anrechenbare Punkte je Monat (eigene Produktion, nach Produktionsdatum)"
            data={d.trend.map((t) => ({ label: monthShort(t.month), value: Number(t.points) }))}
          />
        </div>
      </div>

      <ul className="flex flex-col gap-1 text-sm">
        {d.todo.goal_missing && <li>• Für diesen Monat ist noch kein Ziel angelegt. <Link href="/vertrieb/ziele">Ziel festlegen</Link></li>}
        {d.todo.drafts > 0 && <li>• {d.todo.drafts} Produktions-Entwürfe noch nicht eingereicht. <Link href="/vertrieb/produktion">Öffnen</Link></li>}
        {d.todo.goals_to_review > 0 && <li>• {d.todo.goals_to_review} Ziele aus Ihrer Struktur warten auf Freigabe. <Link href="/vertrieb/ziele">Prüfen</Link></li>}
      </ul>
    </section>
  );
};

const TeamSection = ({ d }: { d: TeamDashboard }) => (
  <section className="flex flex-col gap-3">
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h2 className="text-lg font-semibold">Meine Struktur</h2>
      <span className="text-sm text-color-text-subtle">
        {d.team_size} Personen · <PointsValue value={d.structure_total.points} /> im Monat
      </span>
    </div>
    <DataTable
      rows={d.direct_reports}
      getRowId={(r) => r.employee_id}
      caption="Direkte Führungslinien"
      emptyMessage="Keine direkten Mitarbeitenden"
      columns={[
        { id: "name", header: "Name", cell: (r) => `${r.name}${r.level ? ` (${r.level})` : ""}`, sortValue: (r) => r.name },
        { id: "own", header: "Eigen", align: "right", cell: (r) => <PointsValue value={r.own.points} />, sortValue: (r) => Number(r.own.points) },
        { id: "structure", header: "Struktur", align: "right", hideOnMobile: true, cell: (r) => <PointsValue value={r.structure.points} />, sortValue: (r) => Number(r.structure.points) },
        { id: "goal", header: "Ziel", cell: (r) => (r.goal ? <StatusBadge status={r.goal.status} map={goalStatus} /> : <span className="text-xs text-color-text-subtle">fehlt</span>) },
        {
          id: "career",
          header: "Karriere",
          hideOnMobile: true,
          cell: (r) =>
            r.career_status === "ready" ? (
              <StatusBadge status="ready" map={{ ready: { label: "qualifiziert", tone: "success" } }} />
            ) : (
              <span className="text-xs text-color-text-subtle">{r.career_status === "in_progress" ? "in Arbeit" : r.career_status ?? "–"}</span>
            ),
        },
      ]}
    />
  </section>
);

const AdminSection = ({ d }: { d: AdminDashboard }) => {
  const items = [
    { n: d.without_level.length, text: "aktive Personen ohne Karrierestufe", href: "/admin/mitarbeiter", names: d.without_level },
    { n: d.without_assignment.length, text: "aktive Personen ohne Platz in der Struktur", href: "/admin/hierarchie", names: d.without_assignment },
    { n: d.expired_invites, text: "abgelaufene Einladungen", href: "/admin/mitarbeiter" },
    { n: d.production_to_confirm, text: "eingereichte Verträge warten auf Bestätigung", href: "/vertrieb/produktion" },
    { n: d.open_exceptions, text: "offene Fälle in der Prüfwarteschlange", href: "/vertrieb/provisionen/abrechnung" },
    { n: d.goals_to_review, text: "Ziele warten auf Freigabe", href: "/vertrieb/ziele" },
    { n: d.unapproved_past_months.length, text: "vergangene Abrechnungsmonate nicht freigegeben", href: "/vertrieb/provisionen/abrechnung" },
  ].filter((i) => i.n > 0);

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">Datenqualität & Warteschlangen</h2>
      {items.length === 0 ? (
        <p className="text-sm text-color-success-text">Alles erledigt.</p>
      ) : (
        <ul className="flex flex-col gap-2 text-sm">
          {items.map((i) => (
            <li key={i.text} className="rounded-radius-md bg-color-bg-card px-3 py-2 shadow-shadow-soft">
              <Link href={i.href} className="font-semibold">{i.n} {i.text}</Link>
              {i.names && <span className="block text-xs text-color-text-subtle">{i.names.slice(0, 5).map((x) => x.name).join(", ")}{i.names.length > 5 ? " …" : ""}</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

/** Agreed coaching actions show up on the employee's dashboard (§8.4). */
const MyActions = ({ employeeId }: { employeeId: string }) => {
  const { data, setActionStatus } = useCoaching(employeeId);
  const open = (data?.actions ?? []).filter((a) => a.status === "open" && a.owner_id === employeeId);
  if (open.length === 0) return null;
  return (
    <section className="rounded-radius-lg border border-color-primary/40 bg-color-bg-accent-subtle p-3">
      <h2 className="mb-2 text-sm font-semibold">Vereinbarte Maßnahmen</h2>
      <ul className="flex flex-col gap-1 text-sm">
        {open.map((a) => (
          <li key={a.id}>
            <label className="flex items-center gap-2">
              <input type="checkbox" onChange={() => setActionStatus.mutate({ id: a.id, status: "done" })} />
              {a.title}
              {a.due_on && <span className="text-xs text-color-text-subtle">bis {formatDate(a.due_on)}</span>}
            </label>
          </li>
        ))}
      </ul>
    </section>
  );
};
