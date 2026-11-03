"use client";

import { errorText } from "../../utils/dbErrors";
import { DetailLayout, RecordHeader } from "../../components/detailLayout/DetailLayout";
import { ErrorBlock } from "../../components/errorBlock/ErrorBlock";
import { LoadingState } from "../../components/loadingState/LoadingState";
import { cardClass } from "../../components/card/card.const";
import Link from "next/link";
import { Fragment, useState } from "react";
import { Button } from "../../components/button/Button";
import { DateInput, TextArea, TimeInput } from "../../components/formFields/FormFields";
import { EmployeePicker } from "../../components/employeePicker/EmployeePicker";
import { EmptyState } from "../../components/emptyState/EmptyState";
import { MfaRequiredNotice } from "../../components/mfa/MfaRequiredNotice";
import { MIN_REASON_LENGTH, ReasonConfirmForm } from "../../components/reasonConfirm/ReasonConfirmForm";
import { useBanner } from "../../context/banner/BannerContext";
import { useModal } from "../../context/modal/ModalContext";
import { usePermissions } from "../../hooks/permissions/usePermissions";
import { useStructure } from "../../hooks/useStructure/useStructure";
import { customerName, customerNo, useCustomer, useCustomerMutations, type Customer } from "../../hooks/useCustomers/useCustomers";
import { CHANNEL_LABEL } from "../../domain/leads";
import { berlinLocalToUtcIso, berlinToday, formatDate, formatDateTime, formatPhone } from "../../utils/format";
import { ActivityPanel } from "../activities/ActivityPanel";
import { CUSTOMER_STATUS_LABEL, CustomerForm } from "./CustomerForm";
import { ConsentCard } from "./ConsentCard";
import { ContractsCard, SOURCE_SYSTEM_LABEL } from "./ContractsCard";
import { ServiceCard } from "./ServiceCard";
import { EmailHistoryCard } from "./EmailHistoryCard";

export const card = cardClass;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Whether `managerId` is above `employeeId` in today's structure (walks the manager chain). */
export function managesEmployee(
  byId: Map<string, { manager_id: string | null }> | undefined, managerId: string | null | undefined, employeeId: string,
): boolean {
  if (!byId || !managerId) return false;
  let current = byId.get(employeeId)?.manager_id ?? null;
  for (let hops = 0; current && hops < 50; hops++) {
    if (current === managerId) return true;
    current = byId.get(current)?.manager_id ?? null;
  }
  return false;
}

export const CustomerDetailPage = ({ customerId }: { customerId: string }) =>
  UUID.test(customerId) ? <CustomerDetail customerId={customerId} /> : <EmptyState message="Kunde nicht gefunden." />;

/** One customer (§10.1): profile, follow-up, adviser, activities, history. */
const CustomerDetail = ({ customerId }: { customerId: string }) => {
  const { data, isLoading, error, refetch } = useCustomer(customerId);
  const { permissions } = usePermissions();
  const { data: structure } = useStructure();
  if (isLoading) return <LoadingState rows={6} />;
  if (error) return <ErrorBlock variant="inline" message="Der Kunde konnte nicht geladen werden." onRetry={() => refetch()} />;
  const c = data?.customer;
  if (!c) return <EmptyState message="Kunde nicht gefunden oder keine Berechtigung." />;
  const name = (id: string | null) => {
    if (!id) return "–";
    const r = structure?.byId.get(id);
    return r ? `${r.first_name} ${r.last_name}` : "–";
  };
  // Compliance reads, it doesn't work on customers. An admin who is neither the
  // adviser nor in the structure needs 2FA for every change (P5-UX-03).
  const inStructure = c.owner_id === permissions.employeeId || managesEmployee(structure?.byId, permissions.employeeId, c.owner_id);
  const adminNeedsMfa = permissions.isAdmin && !inStructure && !permissions.hasMfa;
  const canWork = !c.erased_at && !adminNeedsMfa && (c.owner_id === permissions.employeeId || permissions.isLeader || permissions.isAdmin);
  // Compliance (with 2FA) records objections and withdrawals (P5-PRIV-01).
  const canObject = !c.erased_at && !canWork && permissions.isCompliance && permissions.hasMfa;

  return (
    <DetailLayout
      header={
        <RecordHeader
          title={c.erased_at ? "Gelöscht (pseudonymisiert)" : customerName(c)}
          meta={`${customerNo(c.customer_no)} · ${CUSTOMER_STATUS_LABEL[c.status]}${c.archived_at ? " · archiviert" : ""}`}
        >
          {c.erased_at && <p className="text-sm text-color-text-secondary">Personenbezogene Daten wurden am {formatDate(c.erased_at.slice(0, 10))} gelöscht. Vertrags- und Abrechnungsbezüge bleiben erhalten.</p>}
          {adminNeedsMfa && !c.erased_at && <MfaRequiredNotice />}
        </RecordHeader>
      }
      main={
        <>
          <section className={card}>
            <h2 className="text-base font-semibold">Kontakt- und Beratungshistorie</h2>
            <ActivityPanel filter={{ linkedType: "customer", linkedId: c.id }} canLog={canWork} />
            {c.lead_id && (
              <p className="text-xs text-color-text-subtle">
                Frühere Aktivitäten als Lead: <Link href={`/vertrieb/leads/${c.lead_id}`}>zum Lead</Link>
              </p>
            )}
          </section>
          <ContractsCard customer={c} canWork={canWork} />
          <ServiceCard customer={c} canWork={canWork} />
          <EmailHistoryCard customerId={c.id} />
        </>
      }
      aside={
        <>
          <ProfileCard c={c} canWork={canWork} />
          {canWork && <FollowUpCard c={c} />}
          <AdviserCard c={c} name={name} history={data.assignments} canWork={canWork} />
          <ConsentCard customer={c} mode={canWork ? "full" : canObject ? "objection" : "read"} />
        </>
      }
    />
  );
};

const ProfileCard = ({ c, canWork }: { c: Customer; canWork: boolean }) => {
  const { openModal, closeModal } = useModal();
  const { archive } = useCustomerMutations();
  const { showBanner } = useBanner();
  const rows: [string, React.ReactNode][] = [
    ["Rufname", c.preferred_name ?? "–"],
    ["Geburtsdatum", c.date_of_birth ? formatDate(c.date_of_birth) : "–"],
    ["Telefon", c.phone ? <a href={`tel:${c.phone}`}>{formatPhone(c.phone)}</a> : "–"],
    ["E-Mail", c.email ? <a href={`mailto:${c.email}`}>{c.email}</a> : "–"],
    ["Adresse", [c.street, [c.postal_code, c.city].filter(Boolean).join(" ")].filter(Boolean).join(", ") || "–"],
    ["Kanal", CHANNEL_LABEL[c.preferred_channel] ?? (c.preferred_channel === "letter" ? "Brief" : c.preferred_channel)],
    ["Quelle", c.source_system
      ? `${SOURCE_SYSTEM_LABEL[c.source_system] ?? c.source_system} · Nr. ${c.external_id}${c.last_synced_at ? ` · synchronisiert ${formatDateTime(c.last_synced_at)}` : ""}`
      : c.lead_id ? "aus Lead" : "manuell angelegt"],
  ];
  return (
    <section className={card}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold">Profil</h2>
        {canWork && (
          <span className="flex gap-1">
            <Button text="Bearbeiten" variant="ghost" size="small"
              onClick={() => openModal({ title: "Kunde bearbeiten", size: "large", children: (
                <CustomerForm customer={c} onDone={() => { closeModal(); showBanner("Kunde gespeichert", "Die Änderungen sind übernommen.", "success"); }} />
              ) })} />
            <Button text={c.archived_at ? "Reaktivieren" : "Archivieren"} variant="ghost" size="small" onClick={() => openModal({
              title: c.archived_at ? "Kunde reaktivieren" : "Kunde archivieren",
              children: (
                <ReasonConfirmForm
                  message={c.archived_at ? "Der Kunde erscheint wieder in den Listen." : "Der Kunde wird aus den Listen ausgeblendet. Nichts wird gelöscht."}
                  onCancel={closeModal}
                  onConfirm={async (reason) => {
                    await archive.mutateAsync({ id: c.id, archived: !c.archived_at, reason });
                    closeModal();
                    showBanner(c.archived_at ? "Kunde reaktiviert" : "Kunde archiviert", customerName(c), "success");
                  }}
                />
              ),
            })} />
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
  const save = async (planned: { date: string; time: string } | null) => {
    try {
      // Inside the try: an invalid date or time is a message, not a crash (P5-REG-01).
      const value = planned ? berlinLocalToUtcIso(planned.date, planned.time) : null;
      await update.mutateAsync({ id: c.id, data: { next_follow_up_at: value } });
      showBanner(value ? "Nachfassen geplant" : "Nachfassen entfernt", value ? formatDateTime(value) : customerName(c), "success");
      setDate("");
    } catch (e) {
      showBanner("Nicht gespeichert", errorText(e), "error");
    }
  };
  return (
    <section className={card}>
      <h2 className="text-base font-semibold">Nächstes Nachfassen</h2>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span>{c.next_follow_up_at ? formatDateTime(c.next_follow_up_at) : "Nicht geplant."}</span>
        {c.next_follow_up_at && <Button text="Erledigt / entfernen" variant="ghost" size="small" isLoading={update.isPending} onClick={() => save(null)} />}
      </div>
      <div className="grid grid-cols-2 gap-3">
        {/* Follow-ups lie ahead (P5-UX-05); the database refuses past dates too. */}
        <DateInput label="Datum" value={date} onChange={setDate} min={berlinToday()} />
        <TimeInput label="Uhrzeit" value={time} onChange={setTime} />
      </div>
      <div>
        <Button text="Planen" isLoading={update.isPending} isDisabled={!date || !time} onClick={() => save({ date, time })} />
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
          <TextArea label="Begründung (Pflicht)" value={reason} onChange={setReason} rows={2}
            hint={`${reason.trim().length} Zeichen, mindestens ${MIN_REASON_LENGTH}`} />
          <div>
            <Button text="Zuweisen" isLoading={assign.isPending} isDisabled={!owner || reason.trim().length < MIN_REASON_LENGTH} onClick={async () => {
              try {
                await assign.mutateAsync({ id: c.id, ownerId: owner as string, reason });
                showBanner("Betreuung geändert", `${name(owner)} betreut jetzt ${customerName(c)}.`, "success");
                setOwner(null); setReason("");
              } catch (e) {
                showBanner("Nicht zugewiesen", errorText(e), "error");
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
