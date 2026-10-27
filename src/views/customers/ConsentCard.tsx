"use client";

import { errorText } from "../../utils/dbErrors";
import { cardClass } from "../../components/card/card.const";
import { useState } from "react";
import { Button } from "../../components/button/Button";
import { DateInput, TextArea } from "../../components/formFields/FormFields";
import { StatusBadge } from "../../components/statusBadge/StatusBadge";
import { useBanner } from "../../context/banner/BannerContext";
import { useConsents, type Customer } from "../../hooks/useCustomers/useCustomers";
import {
  BASIS_LABEL, PURPOSE_LABEL, REASON_LABEL, SOURCE_LABEL, currentState, mayContact, type ConsentEvent,
} from "../../domain/consent";
import { berlinLocalToUtcIso, berlinToday, formatDate, formatDateTime } from "../../utils/format";
import { Select } from "../leads/LeadForm";

const card = cardClass;

/**
 * Consents and communication permissions (§10.1, §10.5). Append-only: a
 * mistake is corrected by recording a new entry. Opt-out overrides all.
 */
export const ConsentCard = ({ customer, canWork }: { customer: Customer; canWork: boolean }) => {
  const { data = [], record } = useConsents(customer.id);
  const { showBanner } = useBanner();
  const events = data as ConsentEvent[];
  const state = currentState(events);
  const optedOut = state.get("all")?.action === "opt_out";
  const [form, setForm] = useState({ purpose: "contact_email", action: "granted", basis: "consent", source: "form", evidence: "", date: berlinToday() });
  const set = (k: keyof typeof form) => (v: string) => setForm((x) => ({ ...x, [k]: v }));
  const needsEvidence = form.action === "granted" && form.basis === "consent" && form.evidence.trim().length < 5;

  const save = async (a: { purpose: string; action: string; legalBasis: string | null; source: string; evidence: string; date: string }) => {
    try {
      await record.mutateAsync({
        ...a, effectiveAt: a.date && a.date !== berlinToday() ? berlinLocalToUtcIso(a.date, "12:00") : null,
      });
      setForm((x) => ({ ...x, evidence: "" }));
    } catch (e) {
      showBanner("Nicht gespeichert", errorText(e), "error");
    }
  };

  return (
    <section className={card}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold">Einwilligungen & Kommunikation</h2>
        {optedOut && <StatusBadge status="x" map={{ x: { label: "Widerspruch: keine Kontaktaufnahme", tone: "error" } }} />}
      </div>
      <table className="w-full text-left text-sm">
        <thead><tr className="text-xs text-color-text-subtle"><th>Zweck</th><th>Stand</th><th>Kontakt</th></tr></thead>
        <tbody>
          {Object.entries(PURPOSE_LABEL).map(([purpose, label]) => {
            const last = state.get(purpose);
            const check = mayContact(customer, state, purpose);
            return (
              <tr key={purpose} className="border-t border-color-border-light">
                <td className="py-1">{label}</td>
                <td className="py-1 text-xs">
                  {last ? (last.action === "granted" ? `${BASIS_LABEL[last.legal_basis ?? ""]} seit ${formatDate(last.effective_at.slice(0, 10))}` : `widerrufen am ${formatDate(last.effective_at.slice(0, 10))}`) : "–"}
                </td>
                <td className="py-1">
                  <StatusBadge status={check.allowed ? "y" : "n"} map={{ y: { label: "erlaubt", tone: "success" }, n: { label: REASON_LABEL[check.reason] ?? check.reason, tone: "neutral" } }} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {canWork && (
        <>
          <div className="flex flex-wrap items-end gap-3 border-t border-color-border-light pt-3">
            <Select label="Zweck" value={form.purpose} onChange={set("purpose")} options={Object.entries(PURPOSE_LABEL).map(([value, label]) => ({ value, label }))} />
            <Select label="Erfassen" value={form.action} onChange={set("action")} options={[{ value: "granted", label: "erteilt / Rechtsgrundlage" }, { value: "withdrawn", label: "widerrufen" }]} />
            {form.action === "granted" && (
              <Select label="Rechtsgrundlage" value={form.basis} onChange={set("basis")} options={Object.entries(BASIS_LABEL).map(([value, label]) => ({ value, label }))} />
            )}
            <Select label="Quelle" value={form.source} onChange={set("source")}
              options={Object.entries(SOURCE_LABEL).filter(([k]) => k !== "lead" && k !== "import").map(([value, label]) => ({ value, label }))} />
            <DateInput label="Wirksam am" value={form.date} onChange={set("date")} max={berlinToday()} />
          </div>
          <TextArea label={form.action === "granted" && form.basis === "consent" ? "Nachweis (Pflicht: wo/wie erteilt)" : "Nachweis / Notiz"}
            value={form.evidence} onChange={set("evidence")} rows={2} />
          <div className="flex flex-wrap gap-3">
            <Button text="Erfassen" isLoading={record.isPending} isDisabled={needsEvidence || !form.date}
              onClick={() => save({ purpose: form.purpose, action: form.action, legalBasis: form.action === "granted" ? form.basis : null, source: form.source, evidence: form.evidence, date: form.date })} />
            <Button text={optedOut ? "Widerspruch aufheben" : "Widerspruch: keine Kontaktaufnahme"} variant={optedOut ? "secondary" : "decline"}
              isLoading={record.isPending}
              onClick={() => save({ purpose: "all", action: optedOut ? "opt_in" : "opt_out", legalBasis: null, source: form.source, evidence: form.evidence, date: berlinToday() })} />
          </div>
        </>
      )}

      {events.length > 0 && (
        <details>
          <summary className="cursor-pointer text-sm font-semibold">Verlauf ({events.length})</summary>
          <ol className="mt-2 flex flex-col gap-1 text-xs text-color-text-secondary">
            {events.map((e) => (
              <li key={e.id}>
                {formatDateTime(e.effective_at)} · {e.purpose === "all" ? "Alle Kontakte" : PURPOSE_LABEL[e.purpose]}:{" "}
                {e.action === "granted" ? `erteilt (${BASIS_LABEL[e.legal_basis ?? ""]})` : e.action === "withdrawn" ? "widerrufen" : e.action === "opt_out" ? "Widerspruch" : "Widerspruch aufgehoben"}
                {" · "}{SOURCE_LABEL[e.source] ?? e.source}{e.evidence ? ` – ${e.evidence}` : ""}
              </li>
            ))}
          </ol>
        </details>
      )}
    </section>
  );
};
