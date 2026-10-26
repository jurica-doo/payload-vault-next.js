"use client";

import { useQuery } from "@tanstack/react-query";
import { AuditTimeline, type AuditEntry } from "../../components/auditTimeline/AuditTimeline";
import { CalculationBreakdown } from "../../components/calculationBreakdown/CalculationBreakdown";
import { MoneyValue, PointsValue, AeValue } from "../../components/values/Values";
import { useCalculations, type ProductionRow } from "../../hooks/useProduction/useProduction";
import { supabase } from "../../lib/supabase";
import { formatDate, formatDateTime } from "../../utils/format";

type Details = {
  formula?: string;
  term_used?: string;
  term_capped?: boolean;
  exact_points?: string;
  ae_per_point?: string;
  inputs?: { premium?: string; period?: string; net_or_gross?: string | null; term_years?: string | null };
};

/** "Woher kommt diese Zahl?" for one production record (§1, §14.1). */
export const ProductionDetails = ({ record }: { record: ProductionRow }) => {
  const { data: ledger = [] } = useCalculations(record.id);
  const { data: audit = [] } = useQuery({
    queryKey: ["audit", "production_records", record.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("rpc_audit_for", {
        p_entity_type: "public.production_records",
        p_entity_id: record.id!,
      });
      if (error) return [];
      return (data ?? []).map(
        (e): AuditEntry => ({
          id: String(e.id),
          at: e.at,
          actorName: e.actor_name,
          action: e.action === "insert" ? "hat den Datensatz angelegt" : e.action === "update" ? "hat geändert" : e.action,
          reason: e.reason,
          changes: e.action === "update" && e.new_values
            ? Object.keys(e.new_values as object).map((k) => ({
                field: k,
                from: String((e.old_values as Record<string, unknown>)?.[k] ?? "–"),
                to: String((e.new_values as Record<string, unknown>)[k] ?? "–"),
              }))
            : undefined,
        }),
      );
    },
  });

  const current = [...ledger].reverse().find(
    (c) => c.kind === "original" && !ledger.some((r) => r.reverses_id === c.id),
  );
  const d = (current?.details ?? {}) as Details;

  return (
    <div className="flex flex-col gap-5">
      {current ? (
        <CalculationBreakdown
          inputs={[
            { label: "Sparte", value: record.category_code },
            { label: "Beitrag", value: <MoneyValue value={d.inputs?.premium} /> },
            ...(d.term_used ? [{ label: "Laufzeit (gerechnet)", value: `${d.term_used} Jahre`, note: d.term_capped ? "auf Höchstlaufzeit begrenzt" : undefined }] : []),
            { label: "Produktionsdatum", value: formatDate(record.production_date) },
          ]}
          formula={d.formula}
          steps={[
            { label: "Ergebnis exakt", value: d.exact_points ?? "–" },
            { label: "AE je Punkt", value: d.ae_per_point ?? "–" },
          ]}
          result={{ label: "Punkte (gerundet)", value: <PointsValue value={current.points} /> }}
          ruleVersion={`gültige Umrechnung am ${formatDate(record.production_date)}`}
        />
      ) : (
        <p className="text-sm text-color-text-subtle">
          Punkte werden berechnet, sobald der Datensatz als anrechenbar markiert ist.
        </p>
      )}

      {ledger.length > 0 && (
        <section>
          <h4 className="mb-2 text-sm font-semibold">Buchungen</h4>
          <ul className="flex flex-col gap-1 text-sm">
            {ledger.map((c) => (
              <li key={c.id} className="flex flex-wrap justify-between gap-2">
                <span>{c.kind === "original" ? "Berechnung" : "Rückbuchung"} · {formatDateTime(c.calculated_at)}{c.reason ? ` · ${c.reason}` : ""}</span>
                <span className="flex gap-3"><PointsValue value={c.points} /><AeValue value={c.ae} /></span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h4 className="mb-2 text-sm font-semibold">Verlauf</h4>
        <AuditTimeline entries={audit} />
      </section>
    </div>
  );
};
