"use client";

import { DetailLayout, RecordHeader } from "../../components/detailLayout/DetailLayout";
import { ErrorBlock } from "../../components/errorBlock/ErrorBlock";
import { LoadingState } from "../../components/loadingState/LoadingState";
import { cardClass } from "../../components/card/card.const";
import Link from "next/link";
import { Fragment, useState } from "react";
import { Button } from "../../components/button/Button";
import { DateInput, TextArea } from "../../components/formFields/FormFields";
import { InputField } from "../../components/inputField/InputField";
import { EmployeePicker } from "../../components/employeePicker/EmployeePicker";
import { EmptyState } from "../../components/emptyState/EmptyState";
import { ProvisionalRuleNotice } from "../../components/provisionalRuleNotice/ProvisionalRuleNotice";
import { ReasonConfirmForm } from "../../components/reasonConfirm/ReasonConfirmForm";
import { StageStepper } from "../../components/stageStepper/StageStepper";
import { StatusBadge } from "../../components/statusBadge/StatusBadge";
import { useBanner } from "../../context/banner/BannerContext";
import { useModal } from "../../context/modal/ModalContext";
import { usePermissions } from "../../hooks/permissions/usePermissions";
import { useActivities } from "../../hooks/useActivities/useActivities";
import { useRules } from "../../hooks/useRules/useRules";
import { useStructure } from "../../hooks/useStructure/useStructure";
import {
  findLeadDuplicates, leadName, leadNo, useLead, useLeadConfig, useLeadMutations, type DuplicateMatch, type Lead,
} from "../../hooks/useLeads/useLeads";
import {
  CHANNEL_LABEL, CONSENT_LABEL, LOSS_REASON_LABEL, REQUIRED_FIELD_LABEL, missingFields, slaState, stageChangeNeedsReason,
} from "../../domain/leads";
import { normalizeEmail, normalizePhone } from "../../domain/normalize";
import { berlinLocalToUtcIso, formatDateTime } from "../../utils/format";
import { ActivityPanel } from "../activities/ActivityPanel";
import { Select } from "./LeadForm";
import { ConvertLead } from "./ConvertLead";
import { SLA_BADGE } from "./LeadsPage";

const card = cardClass;
const errText = (e: unknown) => (e instanceof Error ? e.message : "");

/** One lead (§9.1): pipeline, details, next step, assignment, activities, history. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const LeadDetailPage = ({ leadId }: { leadId: string }) =>
  UUID.test(leadId) ? <LeadDetail leadId={leadId} /> : <EmptyState message="Lead nicht gefunden." />;

const LeadDetail = ({ leadId }: { leadId: string }) => {
  const { data, isLoading, error, refetch } = useLead(leadId);
  const { data: config } = useLeadConfig();
  const { data: structure } = useStructure();
  const { data: activities = [] } = useActivities({ linkedType: "lead", linkedId: leadId });
  if (isLoading) return <LoadingState rows={6} />;
  // A failed request is not the same as "no such lead" — say which it is.
  if (error) return <ErrorBlock variant="inline" message="Der Lead konnte nicht geladen werden." onRetry={() => refetch()} />;
  const lead = data?.lead;
  if (!lead || !config) return <EmptyState message="Lead nicht gefunden oder keine Berechtigung." />;

  const stages = config.stages.filter((s) => s.active);
  const current = config.stages.find((s) => s.code === lead.stage);
  const mainPath = stages.filter((s) => s.kind === "open").map((s) => ({ id: s.code, label: s.name_de }));
  const outcome = current && current.kind !== "open"
    ? { label: current.name_de, tone: current.kind === "won" ? "success" as const : "error" as const }
    : undefined;
  const name = (id: string | null) => {
    if (!id) return "Pool";
    const r = structure?.byId.get(id);
    return r ? `${r.first_name} ${r.last_name}` : "–";
  };
  // Closed leads show how far they got on the main path.
  const lastOpen = [...data.stageHistory].reverse().find((h) => config.stages.find((s) => s.code === h.to_stage)?.kind === "open")?.to_stage ?? "";
  const hasAppointment = activities.some((a) => a.type === "appointment" && (a.outcome === null || a.outcome === "held"));
  const hasHeldAppointment = activities.some((a) => a.type === "appointment" && a.outcome === "held");

  return (
    <DetailLayout
      header={
        <RecordHeader
          title={leadName(lead)}
          meta={`${leadNo(lead.lead_no)}${lead.company && lead.first_name ? ` · ${lead.company}` : ""}`}
          action={<ConvertLead lead={lead} />}
        >
          <StageStepper stages={mainPath} currentId={current?.kind === "open" ? lead.stage : lastOpen} outcome={outcome} />
        </RecordHeader>
      }
      main={
        <>
          <section className={card}>
            <h2 className="text-base font-semibold">Aktivitäten</h2>
            <ActivityPanel filter={{ linkedType: "lead", linkedId: lead.id }} canLog={!current || !["won", "lost"].includes(current.kind)} />
          </section>

          <section className={card}>
            <h2 className="text-base font-semibold">Verlauf</h2>
            <ol className="flex flex-col gap-1 text-sm">
              {data.stageHistory.map((h) => (
                <li key={h.id}>
                  <span className="text-color-text-subtle">{formatDateTime(h.changed_at)}</span>{" · "}
                  {config.stages.find((s) => s.code === h.to_stage)?.name_de ?? h.to_stage}
                  {h.automatic ? " (automatisch)" : h.changed_by ? ` · ${name(h.changed_by)}` : ""}
                  {h.note && <span className="text-color-text-secondary"> – {h.note}</span>}
                </li>
              ))}
            </ol>
          </section>
        </>
      }
      aside={
        <>
          <StageCard lead={lead} stages={stages} hasAppointment={hasAppointment} hasHeldAppointment={hasHeldAppointment} />
          <NextStepCard lead={lead} />
          <AssignmentCard lead={lead} name={name} history={data.assignments} />
          <DetailsCard lead={lead} sourceName={config.sources.find((s) => s.id === lead.source_id)?.name ?? "–"} provisionalSla={config.sla.provisional} slaHours={config.sla.first_contact_hours} />
          <DuplicatesCard lead={lead} />
        </>
      }
    />
  );
};

const StageCard = ({ lead, stages, hasAppointment, hasHeldAppointment }: {
  lead: Lead; stages: { code: string; name_de: string; kind: string; position: number; required_fields: string[] }[];
  hasAppointment: boolean; hasHeldAppointment: boolean;
}) => {
  const { setStage } = useLeadMutations();
  const { showBanner } = useBanner();
  const [target, setTarget] = useState("");
  const [note, setNote] = useState("");
  const [loss, setLoss] = useState("");
  const from = stages.find((s) => s.code === lead.stage);
  const to = stages.find((s) => s.code === target);
  const needsReason = from && to ? stageChangeNeedsReason(from, to) : false;
  const missing = to
    ? missingFields({ ...lead, loss_reason: loss || null, hasAppointment, hasHeldAppointment }, to.required_fields)
    : [];

  return (
    <section className={card}>
      <h2 className="text-base font-semibold">Phase ändern</h2>
      <Select label="Neue Phase" value={target} onChange={setTarget}
        options={[{ value: "", label: "– wählen –" }, ...stages.filter((s) => s.code !== lead.stage).map((s) => ({ value: s.code, label: s.name_de }))]} />
      {to?.kind === "lost" && (
        <Select label="Verlustgrund" value={loss} onChange={setLoss}
          options={[{ value: "", label: "– wählen –" }, ...Object.entries(LOSS_REASON_LABEL).map(([value, label]) => ({ value, label }))]} />
      )}
      {to && <TextArea label={needsReason ? "Begründung (Pflicht, mind. 10 Zeichen)" : "Notiz"} value={note} onChange={setNote} rows={2} />}
      {missing.length > 0 && (
        <p className="text-xs text-color-error-text">Es fehlt: {missing.map((f) => REQUIRED_FIELD_LABEL[f] ?? f).join(", ")}.</p>
      )}
      {to && (
        <div>
          <Button text="Phase setzen" isLoading={setStage.isPending}
            isDisabled={missing.length > 0 || (needsReason && note.trim().length < 10)}
            onClick={async () => {
              try {
                await setStage.mutateAsync({ id: lead.id, stage: target, note, lossReason: loss || null });
                setTarget(""); setNote(""); setLoss("");
              } catch (e) {
                showBanner("Nicht gespeichert", errText(e), "error");
              }
            }} />
        </div>
      )}
      {lead.loss_reason && <p className="text-xs text-color-text-subtle">Verlustgrund: {LOSS_REASON_LABEL[lead.loss_reason]}</p>}
    </section>
  );
};

const NextStepCard = ({ lead }: { lead: Lead }) => {
  const { update } = useLeadMutations();
  const { showBanner } = useBanner();
  const [text, setText] = useState(lead.next_action ?? "");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("10:00");
  const overdue = lead.next_action_at !== null && lead.next_action_at < new Date().toISOString();
  return (
    <section className={card}>
      <h2 className="text-base font-semibold">Nächster Schritt</h2>
      <p className={`text-sm ${overdue ? "text-color-error-text" : ""}`}>
        {lead.next_action_at ? `${formatDateTime(lead.next_action_at)} · ${lead.next_action ?? "ohne Beschreibung"}${overdue ? " (überfällig)" : ""}` : "Kein nächster Schritt geplant."}
      </p>
      <InputField label="Was" placeholder="z. B. Angebot nachfassen" value={text} onChange={setText} />
      <div className="grid grid-cols-2 gap-3">
        <DateInput label="Wann" value={date} onChange={setDate} />
        <InputField label="Uhrzeit" placeholder="10:00" value={time} onChange={setTime} />
      </div>
      <div>
        <Button text="Planen" isLoading={update.isPending} isDisabled={!date || !/^\d{1,2}:\d{2}$/.test(time)} onClick={async () => {
          try {
            await update.mutateAsync({ id: lead.id, data: { next_action: text.trim() || null, next_action_at: berlinLocalToUtcIso(date, time.padStart(5, "0")) } });
            setDate("");
          } catch (e) {
            showBanner("Nicht gespeichert", errText(e), "error");
          }
        }} />
      </div>
    </section>
  );
};

const DetailsCard = ({ lead, sourceName, provisionalSla, slaHours }: { lead: Lead; sourceName: string; provisionalSla: boolean; slaHours: number }) => {
  const { openModal, closeModal } = useModal();
  const sla = slaState(lead);
  const rows: [string, React.ReactNode][] = [
    ["Telefon", lead.phone ? <a href={`tel:${lead.phone}`}>{lead.phone}</a> : "–"],
    ["E-Mail", lead.email ? <a href={`mailto:${lead.email}`}>{lead.email}</a> : "–"],
    ["Kanal", CHANNEL_LABEL[lead.preferred_channel] ?? lead.preferred_channel],
    ["Quelle", `${sourceName}${lead.campaign ? ` · ${lead.campaign}` : ""}`],
    ["Eingang", formatDateTime(lead.received_at)],
    ["Erstkontakt", <span key="sla"><StatusBadge status={sla} map={SLA_BADGE} /> {lead.first_contact_at ? formatDateTime(lead.first_contact_at) : lead.sla_due_at ? `fällig bis ${formatDateTime(lead.sla_due_at)}` : ""}</span>],
    ["Produktinteresse", lead.product_interest.join(", ") || "–"],
    ["Rechtsgrundlage", lead.consent_basis ? CONSENT_LABEL[lead.consent_basis] : <span className="text-color-secondary">nicht erfasst</span>],
    ["Region", lead.region ?? "–"],
    ["Priorität", lead.priority],
  ];
  return (
    <section className={card}>
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Details</h2>
        <button type="button" className="cursor-pointer text-sm font-semibold text-color-text-accent"
          onClick={() => openModal({ title: "Lead bearbeiten", size: "large", children: <EditLeadForm lead={lead} onDone={closeModal} /> })}>
          Bearbeiten
        </button>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        {rows.map(([k, v]) => (<Fragment key={k}><dt className="text-color-text-subtle">{k}</dt><dd>{v}</dd></Fragment>))}
      </dl>
      {lead.notes && <p className="whitespace-pre-line text-sm text-color-text-secondary">{lead.notes}</p>}
      {provisionalSla && <ProvisionalRuleNotice decisionId="OD-19" text={`Die Erstkontakt-Frist (${slaHours} Geschäftsstunden) ist ein Platzhalter, bis Profina den Wert festlegt.`} />}
    </section>
  );
};

const EditLeadForm = ({ lead, onDone }: { lead: Lead; onDone: () => void }) => {
  const { update } = useLeadMutations();
  const { data: rules } = useRules();
  const { showBanner } = useBanner();
  const [f, setF] = useState({
    first_name: lead.first_name ?? "", last_name: lead.last_name ?? "", company: lead.company ?? "",
    phone: lead.phone ?? "", email: lead.email ?? "", consent_basis: lead.consent_basis ?? "", region: lead.region ?? "",
    priority: lead.priority, notes: lead.notes ?? "",
  });
  const [interest, setInterest] = useState<string[]>(lead.product_interest);
  const set = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: v }));
  const phone = f.phone.trim() ? normalizePhone(f.phone) : null;
  const email = f.email.trim() ? normalizeEmail(f.email) : null;
  const phoneError = f.phone.trim() && !phone ? "Ungültige Telefonnummer" : undefined;
  const emailError = f.email.trim() && !email ? "Ungültige E-Mail-Adresse" : undefined;
  return (
    <form className="flex flex-col gap-3 pt-2" onSubmit={async (e) => {
      e.preventDefault();
      if (phoneError || emailError) return;
      try {
        await update.mutateAsync({ id: lead.id, data: {
          first_name: f.first_name, last_name: f.last_name, company: f.company, phone, email,
          consent_basis: f.consent_basis || null, region: f.region, priority: f.priority, notes: f.notes, product_interest: interest,
        } });
        onDone();
      } catch (err) {
        showBanner("Nicht gespeichert", errText(err), "error");
      }
    }}>
      <div className="grid gap-3 sm:grid-cols-3">
        <InputField label="Vorname" placeholder="Max" value={f.first_name} onChange={set("first_name")} />
        <InputField label="Nachname" placeholder="Mustermann" value={f.last_name} onChange={set("last_name")} />
        <InputField label="Firma" placeholder="optional" value={f.company} onChange={set("company")} />
        <InputField label="Telefon" placeholder="0170 1234567" value={f.phone} onChange={set("phone")} error={phoneError} />
        <InputField label="E-Mail" placeholder="name@beispiel.de" value={f.email} onChange={set("email")} error={emailError} />
        <InputField label="Region" placeholder="z. B. München" value={f.region} onChange={set("region")} />
        <Select label="Rechtsgrundlage Kontakt" value={f.consent_basis} onChange={set("consent_basis")}
          options={[{ value: "", label: "noch nicht erfasst" }, ...Object.entries(CONSENT_LABEL).map(([value, label]) => ({ value, label }))]} />
        <Select label="Priorität" value={f.priority} onChange={set("priority")}
          options={[{ value: "low", label: "niedrig" }, { value: "normal", label: "normal" }, { value: "high", label: "hoch" }]} />
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
      <TextArea label="Notiz" value={f.notes} onChange={set("notes")} rows={3} />
      <div><Button type="submit" text="Speichern" isLoading={update.isPending} /></div>
    </form>
  );
};

const AssignmentCard = ({ lead, name, history }: {
  lead: Lead; name: (id: string | null) => string;
  history: { id: number; from_owner: string | null; to_owner: string | null; assigned_by: string | null; reason: string | null; assigned_at: string }[];
}) => {
  const { permissions } = usePermissions();
  const { data: structure } = useStructure();
  const { assign } = useLeadMutations();
  const { showBanner } = useBanner();
  const [owner, setOwner] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const canAssign = permissions.isLeader || permissions.isAdmin;
  const needsReason = lead.owner_id !== null;
  const people = structure
    ? [...structure.byId.values()].filter((r) => r.status === "active")
        .map((r) => ({ id: r.employee_id, first_name: r.first_name, last_name: r.last_name, employee_no: r.employee_no }))
    : [];
  return (
    <section className={card}>
      <h2 className="text-base font-semibold">Zuständig: {name(lead.owner_id)}</h2>
      {canAssign && (
        <>
          <EmployeePicker label={lead.owner_id ? "Neu zuweisen an" : "Zuweisen an"} employees={people} value={owner} onChange={setOwner}
            excludeIds={lead.owner_id ? [lead.owner_id] : []} />
          {needsReason && <TextArea label="Begründung (Pflicht, mind. 10 Zeichen)" value={reason} onChange={setReason} rows={2} />}
          <div>
            <Button text="Zuweisen" isLoading={assign.isPending} isDisabled={!owner || (needsReason && reason.trim().length < 10)}
              onClick={async () => {
                try {
                  const r = await assign.mutateAsync({ id: lead.id, ownerId: owner, reason });
                  showBanner("Zugewiesen", r.appointments_moved ? `${r.appointments_moved} anstehende(r) Termin(e) übertragen.` : "", "success");
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
            {formatDateTime(h.assigned_at)} · {name(h.from_owner)} → {name(h.to_owner)}{h.assigned_by ? ` (durch ${name(h.assigned_by)})` : ""}
            {h.reason && ` – ${h.reason}`}
          </li>
        ))}
      </ol>
    </section>
  );
};

const DuplicatesCard = ({ lead }: { lead: Lead }) => {
  const { merge } = useLeadMutations();
  const { openModal, closeModal } = useModal();
  const { showBanner } = useBanner();
  const [matches, setMatches] = useState<DuplicateMatch[] | null>(null);
  return (
    <section className={card}>
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Duplikate</h2>
        <button type="button" className="cursor-pointer text-sm font-semibold text-color-text-accent" onClick={async () => {
          try {
            setMatches(await findLeadDuplicates({
              first_name: lead.first_name ?? "", last_name: lead.last_name ?? "", company: lead.company ?? "",
              phone: lead.phone, email: lead.email, exclude: lead.id,
            }));
          } catch (e) {
            showBanner("Prüfung fehlgeschlagen", errText(e), "error");
          }
        }}>Prüfen</button>
      </div>
      {matches === null ? (
        <p className="text-sm text-color-text-subtle">Sucht nach Leads mit gleicher Telefonnummer, E-Mail oder ähnlichem Namen.</p>
      ) : matches.length === 0 ? (
        <p className="text-sm">Keine Duplikate gefunden.</p>
      ) : (
        <ul className="flex flex-col gap-2 text-sm">
          {matches.map((d, i) => (
            <li key={d.id ?? i} className="flex flex-wrap items-center justify-between gap-2">
              <span>
                {d.visible && d.id ? <Link href={`/vertrieb/leads/${d.id}`} className="font-semibold">{leadNo(d.lead_no ?? 0)} {d.name}</Link> : "Lead einer anderen Person"}
                <span className="text-color-text-subtle"> · {d.reason === "phone" ? "gleiche Telefonnummer" : d.reason === "email" ? "gleiche E-Mail" : "ähnlicher Name"}{d.owner ? ` · ${d.owner}` : ""}</span>
              </span>
              {d.visible && d.id && (
                <button type="button" className="cursor-pointer text-xs font-semibold text-color-text-accent" onClick={() => openModal({
                  title: "Leads zusammenführen",
                  children: (
                    <ReasonConfirmForm
                      message={`${leadNo(d.lead_no ?? 0)} wird in diesen Lead übernommen: leere Felder werden ergänzt, Aktivitäten verschoben, der andere Lead wird archiviert.`}
                      confirmText="Zusammenführen"
                      onCancel={closeModal}
                      onConfirm={async (reason) => {
                        await merge.mutateAsync({ keepId: lead.id, mergeId: d.id as string, reason });
                        setMatches(null);
                        closeModal();
                      }}
                    />
                  ),
                })}>In diesen Lead übernehmen</button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};
