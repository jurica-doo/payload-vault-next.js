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
import { useStructure } from "../../hooks/useStructure/useStructure";
import {
  customerNo, findCustomerDuplicates, useCustomerMutations, type Customer, type CustomerDuplicate, type CustomerInput,
} from "../../hooks/useCustomers/useCustomers";
import { normalizeEmail, normalizePhone } from "../../domain/normalize";
import { CHANNEL_LABEL } from "../../domain/leads";
import { berlinToday } from "../../utils/format";
import { Select } from "../leads/LeadForm";

export const CUSTOMER_STATUS_LABEL: Record<string, string> = {
  prospect: "Interessent", active: "Aktiv", inactive: "Inaktiv", former: "Ehemalig",
};
const CHANNELS = { ...CHANNEL_LABEL, letter: "Brief" };

/**
 * Create or edit a customer (§10.1). Creating checks for duplicates first
 * and only saves after an explicit confirmation (the database enforces it).
 * The birth date is optional on purpose (data minimisation, §10.5).
 */
export const CustomerForm = ({ customer, onDone }: { customer?: Customer; onDone: (id: string) => void }) => {
  const { permissions } = usePermissions();
  const { data: structure } = useStructure();
  const { create, update } = useCustomerMutations();
  const { showBanner } = useBanner();
  const [f, setF] = useState({
    first_name: customer?.first_name ?? "", last_name: customer?.last_name ?? "", company: customer?.company ?? "",
    preferred_name: customer?.preferred_name ?? "", date_of_birth: customer?.date_of_birth ?? "",
    phone: customer?.phone ?? "", email: customer?.email ?? "", street: customer?.street ?? "",
    postal_code: customer?.postal_code ?? "", city: customer?.city ?? "",
    preferred_channel: customer?.preferred_channel ?? "any", status: customer?.status ?? "active", notes: customer?.notes ?? "",
  });
  const [owner, setOwner] = useState<string | null>(permissions.employeeId ?? null);
  const [dupes, setDupes] = useState<CustomerDuplicate[] | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const set = (k: keyof typeof f) => (v: string) => { setF((x) => ({ ...x, [k]: v })); setDupes(null); setConfirmed(false); };

  const phone = f.phone.trim() ? normalizePhone(f.phone) : null;
  const email = f.email.trim() ? normalizeEmail(f.email) : null;
  const phoneError = f.phone.trim() && !phone ? "Ungültige Telefonnummer" : undefined;
  const emailError = f.email.trim() && !email ? "Ungültige E-Mail-Adresse" : undefined;
  const valid = (f.last_name.trim() || f.company.trim()) && !phoneError && !emailError;
  const people = structure
    ? [...structure.byId.values()].filter((r) => r.status === "active")
        .map((r) => ({ id: r.employee_id, first_name: r.first_name, last_name: r.last_name, employee_no: r.employee_no }))
    : [];
  const pending = create.isPending || update.isPending;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    const data: CustomerInput = { ...f, phone, email, date_of_birth: f.date_of_birth || null };
    try {
      if (customer) {
        await update.mutateAsync({ id: customer.id, data });
        onDone(customer.id);
        return;
      }
      if (dupes === null) {
        const found = await findCustomerDuplicates({ first_name: f.first_name, last_name: f.last_name, company: f.company, phone, email });
        setDupes(found);
        if (found.length > 0) return;
      }
      onDone(await create.mutateAsync({ data, ownerId: owner, confirmDuplicates: confirmed }));
    } catch (err) {
      showBanner("Nicht gespeichert", errorText(err), "error");
    }
  };

  return (
    <form className="flex flex-col gap-3 pt-2" onSubmit={submit}>
      <div className="grid gap-3 sm:grid-cols-3">
        <InputField label="Vorname" placeholder="Erika" value={f.first_name} onChange={set("first_name")} />
        <InputField label="Nachname" placeholder="Musterfrau" value={f.last_name} onChange={set("last_name")} />
        <InputField label="Firma" placeholder="optional" value={f.company} onChange={set("company")} />
        <InputField label="Anrede-/Rufname" placeholder="für Briefe und E-Mails" value={f.preferred_name} onChange={set("preferred_name")} />
        <DateInput label="Geburtsdatum (nur wenn nötig)" value={f.date_of_birth} onChange={set("date_of_birth")} max={berlinToday()} />
        <Select label="Status" value={f.status} onChange={set("status")}
          options={Object.entries(CUSTOMER_STATUS_LABEL).map(([value, label]) => ({ value, label }))} />
        <InputField label="Telefon" placeholder="0170 1234567" value={f.phone} onChange={set("phone")} error={phoneError} />
        <InputField label="E-Mail" placeholder="name@beispiel.de" value={f.email} onChange={set("email")} error={emailError} />
        <Select label="Bevorzugter Kanal" value={f.preferred_channel} onChange={set("preferred_channel")}
          options={Object.entries(CHANNELS).map(([value, label]) => ({ value, label }))} />
        <InputField label="Straße" placeholder="Musterstraße 1" value={f.street} onChange={set("street")} />
        <InputField label="PLZ" placeholder="80331" value={f.postal_code} onChange={set("postal_code")} />
        <InputField label="Ort" placeholder="München" value={f.city} onChange={set("city")} />
      </div>
      {!customer && (permissions.isLeader || permissions.isAdmin) && people.length > 1 && (
        <EmployeePicker label="Betreuung" employees={people} value={owner} onChange={setOwner} />
      )}
      <TextArea label="Notiz" value={f.notes} onChange={set("notes")} rows={2} />
      {dupes && dupes.length > 0 && (
        <DuplicateWarning confirmed={confirmed} onConfirmedChange={setConfirmed} hiddenLabel="Kunde einer anderen Person"
          items={dupes.map((d, i) => ({
            key: d.id ?? String(i), reason: d.reason, owner: d.owner,
            ...(d.visible && d.id ? { href: `/vertrieb/kunden/${d.id}`, label: `${customerNo(d.customer_no ?? 0)} ${d.name}` } : {}),
          }))} />
      )}
      <div>
        <Button type="submit" text={customer ? "Speichern" : dupes && dupes.length > 0 ? "Trotzdem anlegen" : "Kunde anlegen"}
          isLoading={pending} isDisabled={!valid || (dupes !== null && dupes.length > 0 && !confirmed)} />
      </div>
    </form>
  );
};
