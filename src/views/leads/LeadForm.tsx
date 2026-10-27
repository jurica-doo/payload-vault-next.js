"use client";

import { errorText } from "../../utils/dbErrors";
import { useState } from "react";
import { Button } from "../../components/button/Button";
import { DateInput, TextArea } from "../../components/formFields/FormFields";
import { InputField } from "../../components/inputField/InputField";
import { EmployeePicker } from "../../components/employeePicker/EmployeePicker";
import { DuplicateWarning } from "../../components/duplicateWarning/DuplicateWarning";
import { useBanner } from "../../context/banner/BannerContext";
import { usePermissions } from "../../hooks/permissions/usePermissions";
import { useRules } from "../../hooks/useRules/useRules";
import { useStructure } from "../../hooks/useStructure/useStructure";
import { findLeadDuplicates, leadNo, useLeadConfig, useLeadMutations, type DuplicateMatch, type LeadInput } from "../../hooks/useLeads/useLeads";
import { normalizeEmail, normalizePhone } from "../../domain/normalize";
import { CHANNEL_LABEL, CONSENT_LABEL } from "../../domain/leads";
import { berlinLocalToUtcIso, berlinToday } from "../../utils/format";

const selectClass = "ui-input";

/** Shared select markup for small option lists. */
export const Select = ({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[];
}) => (
  <label className="flex flex-col gap-1 text-[14px] font-semibold text-color-text-secondary">
    {label}
    <select value={value} onChange={(e) => onChange(e.target.value)} className={selectClass}>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  </label>
);

/**
 * Lead intake (§9.1, §9.3, §9.5). Before saving, the form asks the database
 * for likely duplicates and only creates the lead after an explicit
 * "kein Duplikat" confirmation — the database enforces the same rule.
 */
export const LeadForm = ({ onDone }: { onDone: (id: string) => void }) => {
  const { permissions } = usePermissions();
  const { data: config } = useLeadConfig();
  const { data: rules } = useRules();
  const { data: structure } = useStructure();
  const { create } = useLeadMutations();
  const { showBanner } = useBanner();
  const me = permissions.employeeId;
  const canPool = permissions.isLeader || permissions.isAdmin;

  const [f, setF] = useState({
    first_name: "", last_name: "", company: "", phone: "", email: "", preferred_channel: "any",
    source_id: "", campaign: "", referral: "", received: berlinToday(), region: "", priority: "normal",
    consent_basis: "", notes: "",
  });
  const [interest, setInterest] = useState<string[]>([]);
  const [owner, setOwner] = useState<string | null>(me ?? null);
  const [toPool, setToPool] = useState(false);
  const [dupes, setDupes] = useState<DuplicateMatch[] | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const set = (k: keyof typeof f) => (v: string) => { setF((x) => ({ ...x, [k]: v })); setDupes(null); setConfirmed(false); };

  const phone = f.phone.trim() ? normalizePhone(f.phone) : null;
  const email = f.email.trim() ? normalizeEmail(f.email) : null;
  const phoneError = f.phone.trim() && !phone ? "Ungültige Telefonnummer" : undefined;
  const emailError = f.email.trim() && !email ? "Ungültige E-Mail-Adresse" : undefined;
  const sources = (config?.sources ?? []).filter((s) => s.active);
  const sourceId = f.source_id || sources[0]?.id || "";
  const valid = (f.last_name.trim() || f.company.trim()) && !phoneError && !emailError && sourceId;
  const noContact = !phone && !email;
  const people = structure
    ? [...structure.byId.values()].filter((r) => r.status === "active") // RLS: self + own structure (everyone for admins)
        .map((r) => ({ id: r.employee_id, first_name: r.first_name, last_name: r.last_name, employee_no: r.employee_no }))
    : [];

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    try {
      if (dupes === null) {
        const found = await findLeadDuplicates({ first_name: f.first_name, last_name: f.last_name, company: f.company, phone, email });
        setDupes(found);
        if (found.length > 0) return; // show the warning first
      }
      const data: LeadInput = {
        first_name: f.first_name, last_name: f.last_name, company: f.company, phone, email,
        preferred_channel: f.preferred_channel, source_id: sourceId, campaign: f.campaign, referral: f.referral,
        received_at: f.received === berlinToday() ? undefined : berlinLocalToUtcIso(f.received, "09:00"),
        product_interest: interest, region: f.region, priority: f.priority,
        consent_basis: f.consent_basis || null, notes: f.notes,
      };
      const id = await create.mutateAsync({ data, ownerId: toPool ? null : owner, toPool, confirmDuplicates: confirmed });
      onDone(id);
    } catch (err) {
      showBanner("Nicht gespeichert", errorText(err), "error");
    }
  };

  return (
    <form className="flex flex-col gap-3 pt-2" onSubmit={submit}>
      <div className="grid gap-3 sm:grid-cols-3">
        <InputField label="Vorname" placeholder="Max" value={f.first_name} onChange={set("first_name")} />
        <InputField label="Nachname" placeholder="Mustermann" value={f.last_name} onChange={set("last_name")} />
        <InputField label="Firma" placeholder="optional" value={f.company} onChange={set("company")} />
        <InputField label="Telefon" placeholder="0170 1234567" value={f.phone} onChange={set("phone")} error={phoneError} />
        <InputField label="E-Mail" placeholder="name@beispiel.de" type="email" value={f.email} onChange={set("email")} error={emailError} />
        <Select label="Bevorzugter Kanal" value={f.preferred_channel} onChange={set("preferred_channel")}
          options={Object.entries(CHANNEL_LABEL).map(([value, label]) => ({ value, label }))} />
        <Select label="Quelle" value={sourceId} onChange={set("source_id")} options={sources.map((s) => ({ value: s.id, label: s.name }))} />
        <InputField label="Kampagne" placeholder="optional" value={f.campaign} onChange={set("campaign")} />
        <DateInput label="Eingegangen am" value={f.received} onChange={set("received")} max={berlinToday()} />
        <InputField label="Region" placeholder="z. B. München" value={f.region} onChange={set("region")} />
        <Select label="Priorität" value={f.priority} onChange={set("priority")}
          options={[{ value: "low", label: "niedrig" }, { value: "normal", label: "normal" }, { value: "high", label: "hoch" }]} />
        <Select label="Rechtsgrundlage Kontakt" value={f.consent_basis} onChange={set("consent_basis")}
          options={[{ value: "", label: "noch nicht erfasst" }, ...Object.entries(CONSENT_LABEL).map(([value, label]) => ({ value, label }))]} />
      </div>
      <fieldset className="flex flex-wrap gap-3 text-sm">
        <legend className="mb-1 text-[14px] font-semibold text-color-text-secondary">Produktinteresse</legend>
        {(rules?.conversion?.rows ?? []).map((c) => (
          <label key={c.categoryCode} className="flex items-center gap-1">
            <input type="checkbox" checked={interest.includes(c.categoryCode)}
              onChange={(e) => setInterest((x) => (e.target.checked ? [...x, c.categoryCode] : x.filter((k) => k !== c.categoryCode)))} />
            {c.nameDe}
          </label>
        ))}
      </fieldset>
      {(permissions.isLeader || permissions.isAdmin) && (
        <div className="flex flex-wrap items-end gap-3">
          {!toPool && people.length > 1 && <EmployeePicker label="Zuständig" employees={people} value={owner} onChange={setOwner} />}
          {canPool && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={toPool} onChange={(e) => setToPool(e.target.checked)} />
              Noch nicht zuweisen (Pool)
            </label>
          )}
        </div>
      )}
      <TextArea label="Notiz" value={f.notes} onChange={set("notes")} rows={2} />
      {noContact && <p className="text-xs text-color-secondary">Ohne Telefon und E-Mail kann der Lead nicht kontaktiert werden und Duplikate werden nur über den Namen erkannt.</p>}

      {dupes && dupes.length > 0 && (
        <DuplicateWarning confirmed={confirmed} onConfirmedChange={setConfirmed} hiddenLabel="Lead einer anderen Person"
          items={dupes.map((d, i) => ({
            key: d.id ?? String(i), reason: d.reason, owner: d.owner,
            ...(d.visible && d.id ? { href: `/vertrieb/leads/${d.id}`, label: `${leadNo(d.lead_no ?? 0)} ${d.name}` } : {}),
          }))} />
      )}
      <div>
        <Button type="submit" text={dupes && dupes.length > 0 ? "Trotzdem anlegen" : "Lead anlegen"} isLoading={create.isPending}
          isDisabled={!valid || (dupes !== null && dupes.length > 0 && !confirmed)} />
      </div>
    </form>
  );
};
