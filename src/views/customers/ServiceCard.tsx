"use client";

import { useState } from "react";
import { Button } from "../../components/button/Button";
import { DateInput } from "../../components/formFields/FormFields";
import { InputField } from "../../components/inputField/InputField";
import { EmployeePicker } from "../../components/employeePicker/EmployeePicker";
import { useBanner } from "../../context/banner/BannerContext";
import { usePermissions } from "../../hooks/permissions/usePermissions";
import { useStructure } from "../../hooks/useStructure/useStructure";
import { useContracts, useServiceItems, type Customer } from "../../hooks/useCustomers/useCustomers";
import { nextAnniversary } from "../../domain/serviceDates";
import { berlinToday, formatDate } from "../../utils/format";
import { Select } from "../leads/LeadForm";

const card = "flex flex-col gap-3 rounded-radius-lg bg-color-bg-card p-4 shadow-shadow-soft";

export const SERVICE_KIND_LABEL: Record<string, string> = {
  annual_review: "Jahresgespräch",
  pending_documents: "Unterlagen ausstehend",
  follow_up_after_advice: "Nachfassen nach Beratung",
  contract_renewal: "Hauptfälligkeit",
  other: "Sonstiges",
};

/**
 * Service and retention reminders (§10.3). Renewal reminders only from a
 * confirmed contract date; due items appear as tasks before the date.
 */
export const ServiceCard = ({ customer, canWork }: { customer: Customer; canWork: boolean }) => {
  const { data = [], save, setStatus } = useServiceItems(customer.id);
  const { data: contracts = [] } = useContracts(customer.id);
  const { permissions } = usePermissions();
  const { data: structure } = useStructure();
  const { showBanner } = useBanner();
  const today = berlinToday();
  const [f, setF] = useState({ kind: "annual_review", title: "", due: "", recurrence: "none", contract: "", note: "" });
  const [owner, setOwner] = useState<string | null>(customer.owner_id);
  const set = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: v }));
  const renewable = contracts.filter((k) => !k.archived_at && k.renewal_date && k.date_source);
  const isRenewal = f.kind === "contract_renewal";
  const contract = renewable.find((k) => k.id === f.contract);
  const open = data.filter((i) => i.status === "open");
  const closed = data.filter((i) => i.status !== "open");
  const people = structure
    ? [...structure.byId.values()].filter((r) => r.status === "active")
        .map((r) => ({ id: r.employee_id, first_name: r.first_name, last_name: r.last_name, employee_no: r.employee_no }))
    : [];
  const valid = f.title.trim().length >= 3 && (isRenewal ? Boolean(contract) : Boolean(f.due));
  const run = async (fn: () => Promise<unknown>) => {
    try { await fn(); } catch (e) { showBanner("Nicht gespeichert", e instanceof Error ? e.message : "", "error"); }
  };

  return (
    <section className={card}>
      <h2 className="text-base font-semibold">Service & Termine</h2>
      {open.length === 0 ? <p className="text-sm text-color-text-subtle">Keine offenen Serviceanlässe.</p> : (
        <ul className="flex flex-col gap-2 text-sm">
          {open.map((i) => (
            <li key={i.id} className="flex flex-wrap items-start justify-between gap-2">
              <span>
                <span className={i.due_on < today ? "font-semibold text-color-error-text" : "font-semibold"}>{formatDate(i.due_on)}</span>
                {" · "}{i.title}
                <span className="block text-xs text-color-text-subtle">
                  {SERVICE_KIND_LABEL[i.kind]}{i.recurrence === "yearly" ? " · jährlich" : ""}
                  {i.owner_id !== customer.owner_id && structure?.byId.get(i.owner_id) ? ` · ${structure.byId.get(i.owner_id)?.first_name} ${structure.byId.get(i.owner_id)?.last_name}` : ""}
                </span>
              </span>
              {canWork && (
                <span className="flex gap-2 text-xs font-semibold">
                  <button type="button" className="cursor-pointer text-color-text-accent" onClick={() => run(() => setStatus.mutateAsync({ id: i.id, status: "done" }))}>Erledigt</button>
                  <button type="button" className="cursor-pointer text-color-text-subtle" onClick={() => run(() => setStatus.mutateAsync({ id: i.id, status: "cancelled" }))}>Absagen</button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {canWork && (
        <div className="flex flex-col gap-3 border-t border-color-border-light pt-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Select label="Anlass" value={f.kind} onChange={(v) => setF((x) => ({ ...x, kind: v, recurrence: v === "contract_renewal" || v === "annual_review" ? "yearly" : x.recurrence }))}
              options={Object.entries(SERVICE_KIND_LABEL).map(([value, label]) => ({ value, label }))} />
            <InputField label="Titel" placeholder="z. B. Jahresgespräch 2027" value={f.title} onChange={set("title")} />
            {isRenewal ? (
              <Select label="Vertrag (mit bestätigter Hauptfälligkeit)" value={f.contract} onChange={set("contract")}
                options={[{ value: "", label: renewable.length ? "– wählen –" : "kein Vertrag mit bestätigtem Datum" },
                  ...renewable.map((k) => ({ value: k.id, label: `${k.product_name || k.category_code || "Vertrag"} · Nr. ${k.external_contract_id}` }))]} />
            ) : (
              <DateInput label="Fällig am" value={f.due} onChange={set("due")} />
            )}
            <Select label="Wiederholung" value={f.recurrence} onChange={set("recurrence")} options={[{ value: "none", label: "einmalig" }, { value: "yearly", label: "jährlich" }]} />
          </div>
          {isRenewal && contract?.renewal_date && (
            <p className="text-xs text-color-text-subtle">Nächste Hauptfälligkeit: {formatDate(nextAnniversary(contract.renewal_date, today))} ({contract.date_source === "portal" ? "laut Vertragsportal" : "aus Unterlagen bestätigt"})</p>
          )}
          {(permissions.isLeader || permissions.isAdmin) && people.length > 1 && (
            <EmployeePicker label="Zuständig" employees={people} value={owner} onChange={setOwner} />
          )}
          <div>
            <Button text="Anlegen" isLoading={save.isPending} isDisabled={!valid} onClick={() => run(async () => {
              await save.mutateAsync({ kind: f.kind, title: f.title, dueOn: isRenewal ? null : f.due, ownerId: owner, recurrence: f.recurrence, contractId: isRenewal ? f.contract : null, note: f.note });
              setF((x) => ({ ...x, title: "", due: "" }));
            })} />
          </div>
        </div>
      )}
      {closed.length > 0 && (
        <details>
          <summary className="cursor-pointer text-sm font-semibold">Erledigt / abgesagt ({closed.length})</summary>
          <ul className="mt-2 text-xs text-color-text-secondary">
            {closed.map((i) => <li key={i.id}>{formatDate(i.due_on)} · {i.title} · {i.status === "done" ? "erledigt" : "abgesagt"}{i.note ? ` – ${i.note}` : ""}</li>)}
          </ul>
        </details>
      )}
    </section>
  );
};
