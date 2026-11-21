"use client";

import { ScrollX } from "../../components/scrollX/ScrollX";
import { errorText } from "../../utils/dbErrors";
import { LoadingState } from "../../components/loadingState/LoadingState";
import { useState } from "react";
import { EmptyState } from "../../components/emptyState/EmptyState";
import { EmployeePicker } from "../../components/employeePicker/EmployeePicker";
import { ProgressMeter } from "../../components/progressMeter/ProgressMeter";
import { StatusBadge } from "../../components/statusBadge/StatusBadge";
import { PointsValue } from "../../components/values/Values";
import { usePermissions } from "../../hooks/permissions/usePermissions";
import { useStructure } from "../../hooks/useStructure/useStructure";
import { useCareerConfirmation, useCareerProgress, type CareerProgress } from "../../hooks/useCareer/useCareer";
import { ConfirmationCard } from "./ConfirmationCard";
import { PERIOD_LABELS } from "../../domain/careerPeriods";
import { levelName, levelShort } from "../../domain/rules";
import { formatDate, formatPercent, formatPoints } from "../../utils/format";
import { CareerSimulator } from "./CareerSimulator";

// Period end is exclusive in the database; people think in "last day".
/** Period ends are exclusive in the database; people think in "last day". */
export const lastDay = (exclusiveEnd: string) => {
  const d = new Date(`${exclusiveEnd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return formatDate(d.toISOString().slice(0, 10));
};

/** German reasons for compute_qualification "blocked" results (shared with the cockpit). */
export const BLOCKED: Record<string, string> = {
  no_level: "Es ist noch keine Karrierestufe hinterlegt. Die Verwaltung trägt die Einstiegsstufe ein.",
  no_period: "Für heute gibt es keinen Karrierezeitraum (Startdatum liegt in der Zukunft).",
  no_rules_for_date: "Für heute sind keine Karriereregeln hinterlegt.",
};

/** Career progress (§7.4): total and KV points, structure caps, period, pace. */
export const CareerPage = () => {
  const { permissions } = usePermissions();
  const { data: structure } = useStructure();
  const [selected, setSelected] = useState<string | null>(null);
  const { data, isLoading, error } = useCareerProgress(selected);
  const { data: confirmation } = useCareerConfirmation(selected);

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

      {confirmation && <ConfirmationCard confirmation={confirmation} />}

      {isLoading ? (
        <LoadingState label="Fortschritt wird berechnet…" />
      ) : error || !data ? (
        <EmptyState message="Der Fortschritt konnte nicht geladen werden." hint={error ? errorText(error) : undefined} />
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
    return <EmptyState message={`Höchste Stufe erreicht (${levelName(progress.level)}).`} />;
  }

  const p = progress;
  // Earlier: the rest of the calendar year counts from 1 January; later: a level change restarted the count.
  const windowNote =
    p.window.start < p.period.start ? "ganzes Kalenderjahr" : p.window.start > p.period.start ? "Stufenwechsel" : null;
  const retention = p.retention;

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-4 ui-card p-4 sm:p-5">
        <header className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">
            {levelShort(p.level)} → {levelShort(p.target)}{" "}
            <span className="text-sm font-normal text-color-text-subtle">{levelName(p.target)}</span>
          </h2>
          {p.is_ready ? (
            <StatusBadge status="ready" map={{ ready: { label: "Qualifiziert – Freigabe ausstehend", tone: "success" } }} />
          ) : (
            <StatusBadge status="open" map={{ open: { label: "In Arbeit", tone: "info" } }} />
          )}
        </header>

        <p className="text-sm">
          {PERIOD_LABELS[p.period.type]}: {formatDate(p.period.start)} – {lastDay(p.period.end)}
          {windowNote && <> · gezählt ab {formatDate(p.window.start)} ({windowNote})</>}
        </p>

        <ProgressMeter
          label={`Punkte für ${p.target}`}
          achieved={p.eligible}
          required={p.required}
          expected={p.expected_now ?? undefined}
          markers={p.cap_value ? [{ value: p.cap_value, label: "Höchstens anrechenbar aus der stärksten Struktur" }] : []}
        />
        <ProgressMeter label="davon KV-Punkte" achieved={p.eligible_kv} required={p.kv_required} unit="KV-P" />
        {p.own_required !== null && p.own_required !== undefined && (
          <ProgressMeter label="davon eigene Produktion" achieved={p.personal.points} required={p.own_required} />
        )}
        {retention && (
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span>
              Nachhaltigkeitsquote:{" "}
              <span className="font-semibold tabular">{retention.ratio === null ? "–" : formatPercent(retention.ratio, 1)}</span>
              {retention.required !== null && <> (mindestens {formatPercent(retention.required)})</>}
              {Number(retention.cancelled) > 0 && (
                <span className="text-color-text-subtle"> · {formatPoints(retention.cancelled)} P storniert</span>
              )}
            </span>
            <StatusBadge
              status={retention.ok ? "ok" : "low"}
              map={{ ok: { label: "erfüllt", tone: "success" }, low: { label: "zu niedrig", tone: "error" } }}
            />
          </div>
        )}

        <p className="text-xs text-color-text-subtle">
          Es zählen nur abgerechnete Verträge mit Produktionsdatum im Zeitraum; stornierte Verträge werden abgezogen.
          Strukturproduktion wird der Struktur zugerechnet, zu der die Person am Produktionsdatum gehörte. Aus der stärksten
          Struktur zählt höchstens die Hälfte der Punkte und der KV-Punkte.
        </p>
      </section>

      <section className="ui-card p-4 sm:p-5">
        <h3 className="mb-3 text-base font-semibold">Herkunft der Punkte</h3>
        <ScrollX label="Herkunft der Punkte">
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
                <td className="py-2 pr-3 hyphens-none">Eigene Produktion</td>
                <td className="py-2 pr-3 text-right"><PointsValue value={p.personal.points} /></td>
                <td className="py-2 pr-3 text-right"><PointsValue value={p.personal.points} /></td>
                <td className="py-2 pr-3 text-right"><PointsValue value={p.personal.kv} isKv /></td>
              </tr>
              {p.structures.map((s) => (
                <tr key={s.id} className="border-b border-color-border-light last:border-0">
                  <td className="py-2 pr-3 hyphens-none">
                    Struktur {s.name}
                    {(s.cap_applied || s.kv_cap_applied) && (
                      <span className="ml-2 rounded-full border border-color-secondary/40 px-2 text-xs text-color-secondary">
                        {s.cap_applied ? "begrenzt" : "KV begrenzt"}
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-3 text-right"><PointsValue value={s.gross} /></td>
                  <td className="py-2 pr-3 text-right"><PointsValue value={s.eligible} /></td>
                  <td className="py-2 pr-3 text-right"><PointsValue value={s.eligible_kv} isKv /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollX>
      </section>

      <CareerSimulator base={p} target={p.target} />
    </div>
  );
};
