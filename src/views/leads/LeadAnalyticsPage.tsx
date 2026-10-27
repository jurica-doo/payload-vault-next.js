"use client";

import { errorText } from "../../utils/dbErrors";
import { Tabs } from "../../components/tabs/Tabs";
import { LoadingState } from "../../components/loadingState/LoadingState";
import { cardClass } from "../../components/card/card.const";
import { useState } from "react";
import { DataTable } from "../../components/dataTable/DataTable";
import { FunnelChart } from "../../components/charts/FunnelChart";
import { EmptyState } from "../../components/emptyState/EmptyState";
import { KpiTile } from "../../components/kpiTile/KpiTile";
import { PeriodSelector, periodToRange, type Period } from "../../components/periodSelector/PeriodSelector";
import { MoneyValue, PointsValue } from "../../components/values/Values";
import { usePermissions } from "../../hooks/permissions/usePermissions";
import { useLeadFunnel, useSourceTrends, type LeadFunnel } from "../../hooks/useLeads/useLeads";
import { FUNNEL_STEPS, funnelRates, rateValue } from "../../domain/funnel";
import { LOSS_REASON_LABEL } from "../../domain/leads";
import { berlinToday, formatDate, formatPercent } from "../../utils/format";

type Scope = "me" | "team" | "all";

const card = cardClass;

/** Inclusive end date for captions: the RPC window is [from, to). */
const dayBefore = (iso: string) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
};

/** Lead analytics (§9.4): cohort funnel, rates with denominators, sources, owners. */
export const LeadAnalyticsPage = () => {
  const { permissions } = usePermissions();
  const [y, m] = berlinToday().split("-").map(Number);
  const [period, setPeriod] = useState<Period>({ kind: "month", year: y, month: m });
  const [scope, setScope] = useState<Scope>(permissions.isLeader ? "team" : "me");
  const range = periodToRange(period);
  const { data, isLoading, error } = useLeadFunnel(range?.start ?? null, range?.end ?? null, scope);

  if (!permissions.employeeId && !permissions.isAdmin) return <EmptyState message="Nur für Mitarbeitende." />;
  const scopes: { id: Scope; label: string }[] = [
    { id: "me", label: "Meine Leads" },
    ...(permissions.isLeader ? [{ id: "team" as const, label: "Mein Team" }] : []),
    ...(permissions.isAdmin ? [{ id: "all" as const, label: "Gesamt" }] : []),
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PeriodSelector value={period} onChange={setPeriod} years={[y - 1, y]} />
        <Tabs ariaLabel="Auswertungsbereich" value={scope} onChange={setScope} items={scopes.map((s) => ({ value: s.id, label: s.label }))} />
      </div>
      {!range ? <p className="text-sm">Bitte einen gültigen Zeitraum wählen.</p>
        : error ? <p role="alert" className="text-sm text-color-error-text">{errorText(error)}</p>
        : isLoading || !data ? <LoadingState />
        : data.totals.leads === 0 ? <EmptyState message="Im gewählten Zeitraum sind keine Leads eingegangen." />
        : <Report d={data} scope={scope} />}
      {permissions.isAdmin && <SourceTrends />}
    </div>
  );
};

const Report = ({ d, scope }: { d: LeadFunnel; scope: Scope }) => {
  const window = `${formatDate(d.window.from)} – ${formatDate(dayBefore(d.window.to))}`;
  const fc = d.first_contact;
  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {funnelRates(d.totals).map((r) => (
          <KpiTile key={r.id} label={r.label} value={formatPercent(rateValue(r))} hint={`${r.numerator} von ${r.denominator} · ${r.definition}`} />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <section className={card}>
          <h2 className="text-base font-semibold">Funnel</h2>
          <FunnelChart
            steps={FUNNEL_STEPS.map((s) => ({ id: s.id, label: s.label, count: d.totals[s.id] }))}
            window={window}
            attributionNote="Kohorte nach Eingangsdatum, zugeordnet der aktuell zuständigen Person. Gezählt wird, wie weit ein Lead mindestens gekommen ist; gewonnene Leads zählen in allen Stufen."
          />
          <p className="text-xs text-color-text-subtle">
            Offen {d.totals.open} · verloren {d.totals.lost}{d.totals.unassigned ? ` · nicht zugewiesen ${d.totals.unassigned}` : ""}
          </p>
        </section>
        <section className={card}>
          <h2 className="text-base font-semibold">Erstkontakt</h2>
          <div className="grid grid-cols-2 gap-3">
            <KpiTile label="Ø Zeit bis Erstkontakt" value={fc.avg_hours === null ? "–" : `${fc.avg_hours.toLocaleString("de-DE")} h`}
              hint={fc.median_hours === null ? undefined : `Median ${fc.median_hours.toLocaleString("de-DE")} h · Kalenderstunden`} />
            <KpiTile label="Innerhalb der Frist" value={formatPercent(rateValue({ numerator: fc.within_sla, denominator: fc.contacted }))}
              hint={`${fc.within_sla} von ${fc.contacted} kontaktierten Leads`} />
          </div>
          {fc.overdue_open > 0 && <p className="text-sm text-color-error-text">{fc.overdue_open} Lead(s) noch ohne Erstkontakt und über der Frist.</p>}
          <h3 className="text-sm font-semibold">Offene Leads nach Phase</h3>
          <ul className="text-sm">
            {d.by_stage.map((s) => <li key={s.stage}>{s.name}: {s.leads} · Ø {s.avg_age_days.toLocaleString("de-DE")} Tage seit Eingang</li>)}
          </ul>
        </section>
      </div>

      <section className={card}>
        <h2 className="text-base font-semibold">Quellen</h2>
        <DataTable
          rows={d.by_source}
          getRowId={(r) => r.source_id}
          columns={[
            { id: "name", header: "Quelle", cell: (r) => r.name, sortValue: (r) => r.name },
            { id: "leads", header: "Leads", align: "right", cell: (r) => r.leads, sortValue: (r) => r.leads },
            { id: "contact", header: "Kontaktquote", align: "right", hideOnMobile: true, cell: (r) => `${formatPercent(rateValue({ numerator: r.contacted, denominator: r.leads }))} (${r.contacted}/${r.leads})` },
            { id: "won", header: "Gewonnen", align: "right", cell: (r) => `${r.won} (${formatPercent(rateValue({ numerator: r.won, denominator: r.leads }))})`, sortValue: (r) => r.won },
            { id: "points", header: "Punkte", align: "right", hideOnMobile: true, cell: (r) => <PointsValue value={String(r.points)} /> },
            ...(scope === "all" ? [
              { id: "commission", header: "Provision (brutto)", align: "right" as const, hideOnMobile: true, cell: (r: LeadFunnel["by_source"][number]) => <MoneyValue value={String(r.commission ?? 0)} /> },
              { id: "cpl", header: "Kosten/Lead", align: "right" as const, cell: (r: LeadFunnel["by_source"][number]) => r.cost_per_lead === null ? "–" : <MoneyValue value={String(r.cost_per_lead)} /> },
              { id: "cps", header: "Kosten/Abschluss", align: "right" as const, hideOnMobile: true, cell: (r: LeadFunnel["by_source"][number]) => r.cost_per_sale === null ? "–" : <MoneyValue value={String(r.cost_per_sale)} /> },
            ] : []),
          ]}
        />
        <p className="text-xs text-color-text-subtle">
          Punkte und Provision nur aus Leads mit verknüpftem Vertrag.
          {scope === "all" ? " Kosten nur, wenn für die Quelle im Zeitraum Kosten erfasst sind (Monate, die im Zeitraum beginnen)." : " Kosten und Provision je Quelle sind nur in der Gesamtansicht sichtbar."}
        </p>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        {scope !== "me" && (
          <section className={card}>
            <h2 className="text-base font-semibold">Nach Person</h2>
            <DataTable
              rows={d.by_owner}
              getRowId={(r) => r.owner_id ?? "pool"}
              columns={[
                { id: "name", header: "Zuständig", cell: (r) => r.name ?? "Nicht zugewiesen", sortValue: (r) => r.name ?? "" },
                { id: "leads", header: "Leads", align: "right", cell: (r) => r.leads, sortValue: (r) => r.leads },
                { id: "booked", header: "Termine", align: "right", cell: (r) => r.booked, sortValue: (r) => r.booked },
                { id: "won", header: "Gewonnen", align: "right", cell: (r) => r.won, sortValue: (r) => r.won },
                { id: "fc", header: "Ø Erstkontakt", align: "right", hideOnMobile: true, cell: (r) => r.avg_first_contact_hours === null ? "–" : `${r.avg_first_contact_hours.toLocaleString("de-DE")} h` },
              ]}
            />
          </section>
        )}
        <section className={card}>
          <h2 className="text-base font-semibold">Verlustgründe</h2>
          {d.loss_reasons.length === 0 ? <p className="text-sm text-color-text-subtle">Keine verlorenen Leads.</p> : (
            <ul className="text-sm">
              {d.loss_reasons.map((r) => (
                <li key={r.reason}>{LOSS_REASON_LABEL[r.reason] ?? "ohne Angabe"}: {r.leads} ({formatPercent(rateValue({ numerator: r.leads, denominator: d.totals.lost }))} von {d.totals.lost})</li>
              ))}
            </ul>
          )}
          {d.by_month.length > 1 && (
            <>
              <h3 className="text-sm font-semibold">Nach Eingangsmonat</h3>
              <ul className="text-sm">
                {d.by_month.map((r) => <li key={r.month}>{formatDate(r.month).slice(3)}: {r.leads} Leads, {r.won} gewonnen</li>)}
              </ul>
            </>
          )}
        </section>
      </div>
    </>
  );
};

/** Source performance per receipt month (§9.4 "performance of each campaign/source over time"). Admins. */
const SourceTrends = () => {
  const { data = [] } = useSourceTrends(true, 12);
  if (data.length === 0) return null;
  return (
    <section className={card}>
      <h2 className="text-base font-semibold">Quellen im Zeitverlauf (12 Monate, nach Eingangsmonat)</h2>
      <DataTable
        rows={data}
        getRowId={(r) => `${r.source_id}-${r.month}`}
        columns={[
          { id: "month", header: "Monat", cell: (r) => formatDate(r.month).slice(3), sortValue: (r) => r.month },
          { id: "name", header: "Quelle", cell: (r) => r.name, sortValue: (r) => r.name },
          { id: "leads", header: "Leads", align: "right", cell: (r) => r.leads, sortValue: (r) => r.leads },
          { id: "won", header: "Gewonnen", align: "right", cell: (r) => `${r.won} (${formatPercent(rateValue({ numerator: r.won, denominator: r.leads }))})`, sortValue: (r) => r.won },
          { id: "points", header: "Punkte", align: "right", hideOnMobile: true, cell: (r) => <PointsValue value={String(r.points)} /> },
          { id: "cost", header: "Kosten", align: "right", hideOnMobile: true, cell: (r) => (r.cost === null ? "–" : <MoneyValue value={String(r.cost)} />) },
          { id: "cps", header: "Kosten/Abschluss", align: "right", cell: (r) => (r.cost_per_sale === null ? "–" : <MoneyValue value={String(r.cost_per_sale)} />) },
        ]}
      />
    </section>
  );
};
