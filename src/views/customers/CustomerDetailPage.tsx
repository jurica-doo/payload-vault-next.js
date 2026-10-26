"use client";

import Link from "next/link";
import { Fragment, useState } from "react";
import { Button } from "../../components/button/Button";
import { DateInput, TextArea } from "../../components/formFields/FormFields";
import { InputField } from "../../components/inputField/InputField";
import { EmployeePicker } from "../../components/employeePicker/EmployeePicker";
import { EmptyState } from "../../components/emptyState/EmptyState";
import { ReasonConfirmForm } from "../../components/reasonConfirm/ReasonConfirmForm";
import { useBanner } from "../../context/banner/BannerContext";
import { useModal } from "../../context/modal/ModalContext";
import { usePermissions } from "../../hooks/permissions/usePermissions";
import { useStructure } from "../../hooks/useStructure/useStructure";
import { customerName, customerNo, useCustomer, useCustomerMutations, type Customer } from "../../hooks/useCustomers/useCustomers";
import { CHANNEL_LABEL } from "../../domain/leads";
import { berlinLocalToUtcIso, formatDate, formatDateTime } from "../../utils/format";
import { ActivityPanel } from "../activities/ActivityPanel";
import { CUSTOMER_STATUS_LABEL, CustomerForm } from "./CustomerForm";
import { ConsentCard } from "./ConsentCard";
import { ContractsCard } from "./ContractsCard";

export const card = "flex flex-col gap-3 rounded-radius-lg bg-color-bg-card p-4 shadow-shadow-soft";
const errText = (e: unknown) => (e instanceof Error ? e.message : "");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const CustomerDetailPage = ({ customerId }: { customerId: string }) =>
  UUID.test(customerId) ? <CustomerDetail customerId={customerId} /> : <EmptyState message="Kunde nicht gefunden." />;

/** One customer (§10.1): profile, follow-up, adviser, activities, history. */
const CustomerDetail = ({ customerId }: { customerId: string }) => {
  const { data, isLoading } = useCustomer(customerId);
  const { permissions } = usePermissions();
  const { data: structure } = useStructure();
  if (isLoading) return <p className="text-sm">Lädt…</p>;
  const c = data?.customer;
  if (!c) return <EmptyState message="Kunde nicht gefunden oder keine Berechtigung." />;
  const name = (id: string | null) => {
    if (!id) return "–";
    const r = structure?.byId.get(id);
    return r ? `${r.first_name} ${r.last_name}` : "–";
  };
  // Compliance reads, it doesn't work on customers.
  const canWork = !c.erased_at && (c.owner_id === permissions.employeeId || permissions.isLeader || permissions.isAdmin);

  return (
    <div className="flex flex-col gap-4">
      <Link href="/vertrieb/kunden" className="text-sm font-semibold">← Kunden</Link>
      <header className="flex flex-wrap items-baseline gap-2">
        <h1 className="text-xl font-semibold">{c.erased_at ? "Gelöscht (pseudonymisiert)" : customerName(c)}</h1>
        <span className="text-sm text-color-text-subtle">{customerNo(c.customer_no)} · {CUSTOMER_STATUS_LABEL[c.status]}{c.archived_at ? " · archiviert" : ""}</span>
      </header>
      {c.erased_at && <p className="text-sm text-color-text-secondary">Personenbezogene Daten wurden am {formatDate(c.erased_at.slice(0, 10))} gelöscht. Vertrags- und Abrechnungsbezüge bleiben erhalten.</p>}

      <div className="grid gap-4 lg:grid-cols-2">
        <ProfileCard c={c} canWork={canWork} />
        <div className="flex flex-col gap-4">
          {canWork && <FollowUpCard c={c} />}
          <AdviserCard c={c} name={name} history={data.assignments} canWork={canWork} />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ConsentCard customer={c} canWork={canWork} />
        <ContractsCard customer={c} canWork={canWork} />
      </div>

      <section className={card}>
        <h2 className="text-base font-semibold">Kontakt- und Beratungshistorie</h2>
        <ActivityPanel filter={{ linkedType: "customer", linkedId: c.id }} canLog={canWork} />
        {c.lead_id && (
          <p className="text-xs text-color-text-subtle">
            Frühere Aktivitäten als Lead: <Link href={`/vertrieb/leads/${c.lead_id}`}>zum Lead</Link>
          </p>
        )}
      </section>
    </div>
  );
};

const ProfileCard = ({ c, canWork }: { c: Customer; canWork: boolean }) => {
  const { openModal, closeModal } = useModal();
  const { archive } = useCustomerMutations();
  const rows: [string, React.ReactNode][] = [
    ["Rufname", c.preferred_name ?? "–"],
    ["Geburtsdatum", c.date_of_birth ? formatDate(c.date_of_birth) : "–"],
    ["Telefon", c.phone ? <a href={`tel:${c.phone}`}>{c.phone}</a> : "–"],
    ["E-Mail", c.email ? <a href={`mailto:${c.email}`}>{c.email}</a> : "–"],
    ["Adresse", [c.street, [c.postal_code, c.city].filter(Boolean).join(" ")].filter(Boolean).join(", ") || "–"],
    ["Kanal", CHANNEL_LABEL[c.preferred_channel] ?? (c.preferred_channel === "letter" ? "Brief" : c.preferred_channel)],
    ["Quelle", c.source_system ? `${c.source_system} · ${c.external_id}${c.last_synced_at ? ` · synchronisiert ${formatDateTime(c.last_synced_at)}` : ""}` : c.lead_id ? "aus Lead" : "manuell"],
  ];
  return (
    <section className={card}>
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Profil</h2>
        {canWork && (
          <span className="flex gap-3 text-sm font-semibold">
            <button type="button" className="cursor-pointer text-color-text-accent"
              onClick={() => openModal({ title: "Kunde bearbeiten", size: "large", children: <CustomerForm customer={c} onDone={closeModal} /> })}>
              Bearbeiten
            </button>
            <button type="button" className="cursor-pointer text-color-text-subtle" onClick={() => openModal({
              title: c.archived_at ? "Kunde reaktivieren" : "Kunde archivieren",
              children: (
                <ReasonConfirmForm
                  message={c.archived_at ? "Der Kunde erscheint wieder in den Listen." : "Der Kunde wird aus den Listen ausgeblendet. Nichts wird gelöscht."}
                  onCancel={closeModal}
                  onConfirm={async (reason) => { await archive.mutateAsync({ id: c.id, archived: !c.archived_at, reason }); closeModal(); }}
                />
              ),
            })}>{c.archived_at ? "Reaktivieren" : "Archivieren"}</button>
          </span>
        )}
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        {rows.map(([k, v]) => (<Fragment key={k}><dt className="text-color-text-subtle">{k}</dt><dd>{v}</dd></Fragment>))}
      </dl>
      {c.notes && <p className="whitespace-pre-line text-sm text-color-text-secondary">{c.notes}</p>}
    </section>
  );
};

const FollowUpCard = ({ c }: { c: Customer }) => {
  const { update } = useCustomerMutations();
  const { showBanner } = useBanner();
  const [date, setDate] = useState("");
  const [time, setTime] = useState("10:00");
  const save = async (value: string | null) => {
    try {
      await update.mutateAsync({ id: c.id, data: { next_follow_up_at: value } });
      setDate("");
    } catch (e) {
      showBanner("Nicht gespeichert", errText(e), "error");
    }
  };
  return (
    <section className={card}>
      <h2 className="text-base font-semibold">Nächstes Nachfassen</h2>
      <p className="text-sm">
        {c.next_follow_up_at ? formatDateTime(c.next_follow_up_at) : "Nicht geplant."}
        {c.next_follow_up_at && (
          <button type="button" className="ml-2 cursor-pointer text-xs text-color-text-subtle" onClick={() => save(null)}>erledigt / entfernen</button>
        )}
      </p>
      <div className="grid grid-cols-2 gap-3">
        <DateInput label="Datum" value={date} onChange={setDate} />
        <InputField label="Uhrzeit" placeholder="10:00" value={time} onChange={setTime} />
      </div>
      <div>
        <Button text="Planen" isLoading={update.isPending} isDisabled={!date || !/^\d{1,2}:\d{2}$/.test(time)}
          onClick={() => save(berlinLocalToUtcIso(date, time.padStart(5, "0")))} />
      </div>
      <p className="text-xs text-color-text-subtle">Am Tag vorher erscheint eine Aufgabe in Ihrer Aufgabenliste.</p>
    </section>
  );
};

const AdviserCard = ({ c, name, history, canWork }: {
  c: Customer; name: (id: string | null) => string; canWork: boolean;
  history: { id: number; from_owner: string | null; to_owner: string | null; assigned_by: string | null; reason: string | null; assigned_at: string }[];
}) => {
  const { permissions } = usePermissions();
  const { data: structure } = useStructure();
  const { assign } = useCustomerMutations();
  const { showBanner } = useBanner();
  const [owner, setOwner] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const people = structure
    ? [...structure.byId.values()].filter((r) => r.status === "active")
        .map((r) => ({ id: r.employee_id, first_name: r.first_name, last_name: r.last_name, employee_no: r.employee_no }))
    : [];
  return (
    <section className={card}>
      <h2 className="text-base font-semibold">Betreuung: {name(c.owner_id)}</h2>
      {canWork && (permissions.isLeader || permissions.isAdmin) && (
        <>
          <EmployeePicker label="Neu zuweisen an" employees={people} value={owner} onChange={setOwner} excludeIds={[c.owner_id]} />
          <TextArea label="Begründung (Pflicht, mind. 10 Zeichen)" value={reason} onChange={setReason} rows={2} />
          <div>
            <Button text="Zuweisen" isLoading={assign.isPending} isDisabled={!owner || reason.trim().length < 10} onClick={async () => {
              try {
                await assign.mutateAsync({ id: c.id, ownerId: owner as string, reason });
                setOwner(null); setReason("");
              } catch (e) {
                showBanner("Nicht zugewiesen", errText(e), "error");
              }
            }} />
          </div>
        </>
      )}
      <ol className="flex flex-col gap-1 text-xs text-color-text-secondary">
        {history.map((h) => (
          <li key={h.id}>
            {formatDateTime(h.assigned_at)} · {h.from_owner ? `${name(h.from_owner)} → ` : ""}{name(h.to_owner)}
            {h.assigned_by ? ` (durch ${name(h.assigned_by)})` : ""}{h.reason && ` – ${h.reason}`}
          </li>
        ))}
      </ol>
    </section>
  );
};
