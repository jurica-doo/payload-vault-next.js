"use client";

import { useState } from "react";
import { EmptyState } from "../../components/emptyState/EmptyState";
import { EmployeePicker } from "../../components/employeePicker/EmployeePicker";
import { ProgressMeter } from "../../components/progressMeter/ProgressMeter";
import { ProvisionalRuleNotice } from "../../components/provisionalRuleNotice/ProvisionalRuleNotice";
import { StatusBadge } from "../../components/statusBadge/StatusBadge";
import { PointsValue } from "../../components/values/Values";
import { usePermissions } from "../../hooks/permissions/usePermissions";
import { useStructure } from "../../hooks/useStructure/useStructure";
import { useCareerProgress, type CareerProgress } from "../../hooks/useCareer/useCareer";
import { PERIOD_LABELS } from "../../domain/careerPeriods";
import { formatDate } from "../../utils/format";
import { CareerSimulator } from "./CareerSimulator";

const LEVEL_NAMES: Record<string, string> = {
  FA: "Finanzassistent", FB: "Fachberater", TL: "Teamleiter", OL: "Organisationsleiter",
  DL: "Direktionsleiter", RL: "Regionalleiter", VD: "Vertriebsdirektor",
};

// Period end is exclusive in the database; people think in "last day".
const lastDay = (exclusiveEnd: string) => {
  const d = new Date(`${exclusiveEnd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return formatDate(d.toISOString().slice(0, 10));
};

const BLOCKED: Record<string, string> = {
  no_level: "Für diese Person ist noch keine Karrierestufe hinterlegt. Bitte die Verwaltung kontaktieren.",
  no_period: "Für heute gibt es keinen Karrierezeitraum (Startdatum liegt in der Zukunft).",
  no_rules_for_date: "Für heute sind keine Karriereregeln hinterlegt.",
};

/** Career progress (§7.4): total and KV points, structure caps, period, pace. */
export const CareerPage = () => {
  const { permissions } = usePermissions();
  const { data: structure } = useStructure();
  const [selected, setSelected] = useState<string | null>(null);
  const { data, isLoading, error } = useCareerProgress(selected);

  const people = structure
    ? [...structure.byId.values()].map((r) => ({
        id: r.employee_id, first_name: r.first_name, last_name: r.last_name, employee_no: r.employee_no, status: r.status,
      }))
    : [];

  return (
    <div className="flex flex-col gap-4">
      {(permissions.isLeader || permissions.isAdmin) && people.length > 1 && (
        <div className="sm:w-96">
          <EmployeePicker
            label="Person"
            employees={people}
            value={selected ?? permissions.employeeId ?? undefined}
            onChange={(id) => setSelected(id === permissions.employeeId ? null : id)}
          />
        </div>
      )}

      {isLoading ? (
        <p className="text-sm">Fortschritt wird berechnet…</p>
      ) : error || !data ? (
        <EmptyState message="Der Fortschritt konnte nicht geladen werden." hint={error?.message} />
      ) : (
        <ProgressView progress={data} />
      )}
    </div>
  );
};

const ProgressView = ({ progress }: { progress: CareerProgress }) => {
  if (progress.status === "blocked") {
    return <EmptyState message="Kein Fortschritt berechenbar" hint={BLOCKED[progress.reason]} />;
  }
  if (progress.status === "top_level") {
    return <EmptyState message={`Höchste Stufe erreicht (${LEVEL_NAMES[progress.level] ?? progress.level}).`} />;
  }

  const p = progress;
  const windowStartsLater = p.window.start !== p.period.start;

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-4 rounded-radius-lg bg-color-bg-card p-4 shadow-shadow-soft">
        <header className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">
            {p.level} → {p.target}{" "}
            <span className="text-sm font-normal text-color-text-subtle">{LEVEL_NAMES[p.target]}</span>
          </h2>
          {p.is_ready ? (
            <StatusBadge status="ready" map={{ ready: { label: "Qualifiziert – Freigabe ausstehend", tone: "success" } }} />
          ) : (
            <StatusBadge status="open" map={{ open: { label: "In Arbeit", tone: "info" } }} />
          )}
        </header>

        <p className="text-sm">
          {PERIOD_LABELS[p.period.type]}: {formatDate(p.period.start)} – {lastDay(p.period.end)}
          {windowStartsLater && <> · gezählt ab {formatDate(p.window.start)} (Stufenwechsel)</>}
        </p>

        <ProgressMeter
          label={`Punkte für ${p.target}`}
          achieved={p.eligible}
          required={p.required}
          expected={p.expected_now ?? undefined}
          markers={p.cap_value ? [{ value: p.cap_value, label: "Höchstens anrechenbar je Struktur" }] : []}
        />
        <ProgressMeter label="davon KV-Punkte" achieved={p.eligible_kv} required={p.kv_required} unit="KV-P" />

        <p className="text-xs text-color-text-subtle">
          Es zählen nur als anrechenbar bestätigte Verträge mit Produktionsdatum im Zeitraum. Strukturproduktion wird der Struktur zugerechnet,
          zu der die Person am Produktionsdatum gehörte.
        </p>
      </section>

      <section className="rounded-radius-lg bg-color-bg-card p-4 shadow-shadow-soft">
        <h3 className="mb-3 text-base font-semibold">Herkunft der Punkte</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-color-border-light text-left text-color-text-secondary">
                <th className="py-2 pr-3">Quelle</th>
                <th className="py-2 pr-3 text-right">Produziert</th>
                <th className="py-2 pr-3 text-right">Angerechnet</th>
                <th className="py-2 pr-3 text-right">KV angerechnet</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-color-border-light">
                <td className="py-2 pr-3">Eigene Produktion</td>
                <td className="py-2 pr-3 text-right"><PointsValue value={p.personal.points} /></td>
                <td className="py-2 pr-3 text-right"><PointsValue value={p.personal.points} /></td>
                <td className="py-2 pr-3 text-right"><PointsValue value={p.personal.kv} isKv /></td>
              </tr>
              {p.structures.map((s) => (
                <tr key={s.id} className="border-b border-color-border-light last:border-0">
                  <td className="py-2 pr-3">
                    Struktur {s.name}
                    {s.cap_applied && (
                      <span className="ml-2 rounded-full border border-color-secondary/40 px-2 text-xs text-color-secondary">begrenzt</span>
                    )}
                  </td>
                  <td className="py-2 pr-3 text-right"><PointsValue value={s.gross} /></td>
                  <td className="py-2 pr-3 text-right"><PointsValue value={s.eligible} /></td>
                  <td className="py-2 pr-3 text-right"><PointsValue value={s.eligible_kv} isKv /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <CareerSimulator base={p} target={p.target} />

      <ProvisionalRuleNotice decisionId="OD-02" text="Zeitraumgrenzen, Übergangszeitraum und Neustart der Punkte nach einem Stufenwechsel sind noch nicht von Profina bestätigt." />
      {p.cap_value && (
        <ProvisionalRuleNotice decisionId="OD-03/OD-04" text="Strukturbegriff (je direkte Führungslinie) und anteilige KV-Anrechnung bei Begrenzung sind noch nicht bestätigt." />
      )}
    </div>
  );
};
