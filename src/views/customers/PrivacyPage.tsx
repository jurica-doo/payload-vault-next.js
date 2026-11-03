"use client";

import { Pagination } from "../../components/pagination/Pagination";
import { usePagination } from "../../components/pagination/usePagination";
import { errorText } from "../../utils/dbErrors";
import { LoadingState } from "../../components/loadingState/LoadingState";
import { cardClass } from "../../components/card/card.const";
import Link from "next/link";
import { useState } from "react";
import { Button } from "../../components/button/Button";
import { DateInput, TextArea } from "../../components/formFields/FormFields";
import { InputField } from "../../components/inputField/InputField";
import { MfaRequiredNotice } from "../../components/mfa/MfaRequiredNotice";
import { ProvisionalRuleNotice } from "../../components/provisionalRuleNotice/ProvisionalRuleNotice";
import { ReasonConfirmForm } from "../../components/reasonConfirm/ReasonConfirmForm";
import { StatusBadge } from "../../components/statusBadge/StatusBadge";
import { useBanner } from "../../context/banner/BannerContext";
import { useModal } from "../../context/modal/ModalContext";
import { usePermissions } from "../../hooks/permissions/usePermissions";
import { useConsentReport } from "../../hooks/useCustomers/useCustomers";
import { useErasedCustomers, usePrivacy, type PrivacyRequest } from "../../hooks/usePrivacy/usePrivacy";
import { PURPOSE_LABEL } from "../../domain/consent";
import { berlinLocalToUtcIso, berlinToday, formatDate, formatDateTime } from "../../utils/format";
import { Select } from "../../components/select/Select";
import { ModalActions } from "../../components/modal/ModalActions";

const card = cardClass;
const KIND_LABEL: Record<string, string> = { access: "Auskunft", rectification: "Berichtigung", erasure: "Löschung", objection: "Widerspruch" };
/** Export log codes in German (P5-UI-02). */
const EXPORT_KIND_LABEL: Record<string, string> = { subject_access: "Auskunft (Datenexport)" };
const ENTITY_LABEL: Record<string, string> = { customer: "Kunde", lead: "Lead" };
/** "K-00012" / "L-00012" for a request's subject (P5-UX-02). */
export const subjectLabel = (r: Pick<PrivacyRequest, "subject_type" | "subject_no">) =>
  `${r.subject_type === "customer" ? "Kunde" : "Lead"}${r.subject_no ? ` ${r.subject_type === "customer" ? "K" : "L"}-${String(r.subject_no).padStart(5, "0")}` : ""}`;
const VIA_LABEL: Record<string, string> = { email: "E-Mail", letter: "Brief", phone: "Telefon", in_person: "persönlich", portal: "Portal" };

/** Parses "K-00012", "L-7" or "12" into a number. */
export function parseRecordNo(input: string): number | null {
  const m = /^\s*(?:[KL]-?)?0*(\d{1,12})\s*$/i.exec(input);
  return m ? Number(m[1]) : null;
}

/** Saves the export as a JSON file on the officer's device. */
function downloadJson(name: string, data: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

/** Privacy operations (§12.4, §10.5): requests, export, erasure, retention, consent overview. */
export const PrivacyPage = () => {
  const { permissions } = usePermissions();
  const allowed = permissions.isCompliance || permissions.isAdmin;
  const p = usePrivacy(allowed, permissions.isAdmin);
  const { data: report } = useConsentReport(allowed);
  const open = (p.requests.data ?? []).filter((r) => r.status === "open");
  const closed = (p.requests.data ?? []).filter((r) => r.status !== "open");
  const closedPages = usePagination(closed);
  const requestNo = new Map((p.requests.data ?? []).map((r) => [r.id, r.request_no]));
  // Customers already pseudonymised get a hint next to new requests (P5-UX-10).
  const erased = useErasedCustomers(open.filter((r) => r.subject_type === "customer").map((r) => r.subject_id));
  const exportPages = usePagination(p.exports.data ?? []);
  if (!allowed) return <p className="text-sm">Nur für Datenschutz/Compliance und Administratoren.</p>;

  return (
    <div className="flex flex-col gap-4">
      {!permissions.hasMfa && <MfaRequiredNotice />}

      <section className={card}>
        <h2 className="text-base font-semibold">Anfragen betroffener Personen</h2>
        <NewRequestForm />
        {open.length === 0 ? <p className="text-sm text-color-text-subtle">Keine offenen Anfragen.</p> : (
          <ul className="flex flex-col gap-2">{open.map((r) => <RequestRow key={r.id} r={r} erased={erased.has(r.subject_id)} />)}</ul>
        )}
        {closed.length > 0 && (
          <details>
            <summary className="cursor-pointer text-sm font-semibold">Abgeschlossen ({closed.length})</summary>
            <ul className="mt-2 text-xs text-color-text-secondary">
              {closedPages.pageItems.map((r) => (
                <li key={r.id}>DS-{r.request_no} · {KIND_LABEL[r.kind]} · {subjectLabel(r)} · {r.status === "completed" ? "erledigt" : "abgelehnt"} am {formatDate(r.completed_at?.slice(0, 10))}{r.outcome_note ? ` – ${r.outcome_note}` : ""}</li>
              ))}
            </ul>
            <div className="mt-3">
              <Pagination {...closedPages.pagination} />
            </div>
          </details>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className={card}>
          <h2 className="text-base font-semibold">Einwilligungen</h2>
          {report ? (
            <>
              <p className="text-sm">{report.customers} aktive Kunden · {report.opt_outs} mit Widerspruch · {report.recent_withdrawals} Widerrufe in 30 Tagen</p>
              <table className="text-left text-sm">
                <thead><tr className="text-xs text-color-text-subtle"><th>Zweck</th><th>erteilt</th><th>davon Einwilligung</th><th>widerrufen</th></tr></thead>
                <tbody>
                  {report.by_purpose.map((x) => (
                    <tr key={x.purpose}><td>{PURPOSE_LABEL[x.purpose] ?? x.purpose}</td><td>{x.granted}</td><td>{x.by_consent}</td><td>{x.withdrawn}</td></tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : <LoadingState />}
        </section>

        <section className={card}>
          <h2 className="text-base font-semibold">Aufbewahrung</h2>
          {p.retention.data && p.retention.data.customer_years === null && p.retention.data.lead_years === null ? (
            <ProvisionalRuleNotice decisionId="OD-16" text="Aufbewahrungsfristen sind noch nicht festgelegt. Es wird nichts automatisch gelöscht." />
          ) : (
            <ul className="text-sm">
              {(p.retention.data?.customers ?? []).map((c) => <li key={c.id}>K-{String(c.customer_no).padStart(5, "0")} · inaktiv seit {formatDate(c.inactive_since.slice(0, 10))}</li>)}
              {(p.retention.data?.leads ?? []).map((l) => <li key={l.id}>L-{String(l.lead_no).padStart(5, "0")} · abgeschlossen {formatDate(l.closed_at.slice(0, 10))}</li>)}
            </ul>
          )}
          <p className="text-xs text-color-text-subtle">Kandidaten werden nur angezeigt. Gelöscht wird ausschließlich über eine Löschanfrage.</p>
        </section>
      </div>

      <section className={card}>
        <h2 className="text-base font-semibold">Exportprotokoll</h2>
        {(p.exports.data ?? []).length === 0 ? <p className="text-sm text-color-text-subtle">Noch keine Exporte.</p> : (
          <>
            <ul className="text-xs text-color-text-secondary">
              {exportPages.pageItems.map((e) => (
                <li key={e.id}>
                  {formatDateTime(e.at)} · {EXPORT_KIND_LABEL[e.kind] ?? e.kind} · {ENTITY_LABEL[e.entity_type ?? ""] ?? e.entity_type ?? "–"}
                  {e.request_id && requestNo.has(e.request_id) ? ` · DS-${requestNo.get(e.request_id)}` : ""} · {e.row_count ?? "–"} Einträge
                </li>
              ))}
            </ul>
            <Pagination {...exportPages.pagination} />
          </>
        )}
      </section>

      {permissions.isAdmin && (
        <section className={card}>
          <h2 className="text-base font-semibold">Vertragssynchronisation</h2>
          {(p.syncRuns.data ?? []).length === 0 ? (
            <p className="text-sm text-color-text-subtle">Noch keine Synchronisation (Anbindung des Vertragsportals offen, OD-14).</p>
          ) : (
            <ul className="text-sm">
              {(p.syncRuns.data ?? []).map((s) => (
                <li key={s.id}>
                  {formatDateTime(s.started_at)} · {s.source_system} ·{" "}
                  <StatusBadge status={s.status} map={{
                    running: { label: "läuft", tone: "info" }, succeeded: { label: "ok", tone: "success" },
                    partial: { label: "teilweise", tone: "warning" }, failed: { label: "fehlgeschlagen", tone: "error" },
                  }} /> {s.rows_ok}/{s.rows_total} ok
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
};

const NewRequestForm = () => {
  const { permissions } = usePermissions();
  const p = usePrivacy(true, false);
  const { showBanner } = useBanner();
  const [f, setF] = useState({ kind: "access", type: "customer", no: "", via: "email", date: berlinToday(), note: "" });
  const set = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: v }));
  const no = parseRecordNo(f.no);
  return (
    <div className="flex flex-col gap-3 border-b border-color-border-light pb-3">
      <div className="grid gap-3 sm:grid-cols-5">
        <Select label="Art" value={f.kind} onChange={set("kind")} options={Object.entries(KIND_LABEL).map(([value, label]) => ({ value, label }))} />
        <Select label="Betrifft" value={f.type} onChange={set("type")} options={[{ value: "customer", label: "Kunde" }, { value: "lead", label: "Lead" }]} />
        <InputField label="Nummer" placeholder={f.type === "customer" ? "K-00012" : "L-00012"} value={f.no} onChange={set("no")} />
        <Select label="Eingang über" value={f.via} onChange={set("via")} options={Object.entries(VIA_LABEL).map(([value, label]) => ({ value, label }))} />
        <DateInput label="Eingegangen am" value={f.date} onChange={set("date")} max={berlinToday()} />
      </div>
      <TextArea label="Notiz" value={f.note} onChange={set("note")} rows={2} />
      <div>
        <Button text="Anfrage erfassen" isLoading={p.open.isPending} isDisabled={!no || !f.date || !permissions.hasMfa} onClick={async () => {
          try {
            const subject = await p.findSubject(f.type as "customer" | "lead", no as number);
            if (!subject) { showBanner("Nicht gefunden", "Unter dieser Nummer gibt es keinen Eintrag.", "error"); return; }
            await p.open.mutateAsync({
              kind: f.kind, subjectType: f.type, subjectId: subject.id, via: f.via, note: f.note,
              receivedAt: f.date === berlinToday() ? null : berlinLocalToUtcIso(f.date, "09:00"),
            });
            showBanner("Anfrage erfasst", `${KIND_LABEL[f.kind]} · ${f.type === "customer" ? "Kunde" : "Lead"} ${f.no.trim()}${subject.erased ? " (bereits pseudonymisiert)" : ""}`, "success");
            setF((x) => ({ ...x, no: "", note: "" }));
          } catch (e) {
            showBanner("Nicht gespeichert", errorText(e), "error");
          }
        }} />
      </div>
    </div>
  );
};

const RequestRow = ({ r, erased }: { r: PrivacyRequest; erased: boolean }) => {
  const { permissions } = usePermissions();
  const p = usePrivacy(true, false);
  const { openModal, closeModal } = useModal();
  const { showBanner } = useBanner();
  const overdue = r.due_at < new Date().toISOString();
  const subject = subjectLabel(r);
  const disabled = !permissions.hasMfa;
  return (
    <li className="flex flex-wrap items-start justify-between gap-2 text-sm">
      <span>
        <span className="font-semibold">DS-{r.request_no} · {KIND_LABEL[r.kind]}</span> · {subject}
        {r.subject_type === "customer" && <> · <Link href={`/vertrieb/kunden/${r.subject_id}`}>öffnen</Link></>}
        {erased && <span className="text-color-text-subtle"> · bereits pseudonymisiert</span>}
        <span className={`block text-xs ${overdue ? "text-color-error-text" : "text-color-text-subtle"}`}>
          eingegangen {formatDate(r.received_at.slice(0, 10))} ({VIA_LABEL[r.received_via]}) · Frist {formatDate(r.due_at.slice(0, 10))}{overdue ? " – überschritten" : ""}
        </span>
        {r.note && <span className="block text-xs text-color-text-secondary">{r.note}</span>}
      </span>
      <span className="flex flex-wrap gap-1">
        {r.kind === "access" && (
          <Button text="Daten exportieren" variant="ghost" size="small" isDisabled={disabled} isLoading={p.exportData.isPending} onClick={async () => {
            try {
              const data = await p.exportData.mutateAsync(r.id);
              downloadJson(`auskunft-DS-${r.request_no}.json`, data);
              showBanner("Daten exportiert", `DS-${r.request_no}: Datei heruntergeladen, Anfrage abgeschlossen.`, "success");
            } catch (e) {
              showBanner("Export fehlgeschlagen", errorText(e), "error");
            }
          }} />
        )}
        {r.kind === "erasure" && (
          <Button text="Pseudonymisieren" variant="decline" size="small" isDisabled={disabled} onClick={() => openModal({
            title: `Löschanfrage DS-${r.request_no} ausführen`,
            children: <EraseConfirm onCancel={closeModal} onConfirm={async () => {
              await p.erase.mutateAsync(r.id);
              closeModal();
              showBanner("Pseudonymisiert", `DS-${r.request_no}: personenbezogene Daten entfernt.`, "success");
            }} />,
          })} />
        )}
        {r.kind === "objection" && r.subject_type === "customer" && !erased && (
          // One step: records the opt-out on the customer and completes the request (P5-PRIV-01).
          <Button text="Widerspruch umsetzen" variant="secondary" size="small" isDisabled={disabled} onClick={() => openModal({
            title: `Widerspruch DS-${r.request_no} umsetzen`,
            children: (
              <ConfirmAction message="Für den Kunden wird ein Widerspruch gegen jede Kontaktaufnahme erfasst (Nachweis: diese Anfrage). Die Anfrage wird damit abgeschlossen."
                confirmText="Widerspruch umsetzen" onCancel={closeModal} onConfirm={async () => {
                  await p.applyObjection.mutateAsync(r.id);
                  closeModal();
                  showBanner("Widerspruch umgesetzt", `DS-${r.request_no}: keine Kontaktaufnahme mehr.`, "success");
                }} />
            ),
          })} />
        )}
        {(r.kind === "rectification" || (r.kind === "objection" && r.subject_type === "lead")) && (
          <Button text="Abschließen" variant="ghost" size="small" isDisabled={disabled} onClick={() => openModal({
            title: `DS-${r.request_no} abschließen`,
            children: (
              <ReasonConfirmForm message="Was wurde geändert bzw. veranlasst?" reasonLabel="Ergebnis" onCancel={closeModal}
                onConfirm={async (outcome) => {
                  await p.close.mutateAsync({ id: r.id, status: "completed", outcome });
                  closeModal();
                  showBanner("Anfrage abgeschlossen", `DS-${r.request_no}`, "success");
                }} />
            ),
          })} />
        )}
        <Button text="Ablehnen" variant="ghost" size="small" isDisabled={disabled} onClick={() => openModal({
          title: `DS-${r.request_no} ablehnen`,
          children: (
            <ReasonConfirmForm message="Die Ablehnung wird mit Begründung dokumentiert." variant="decline" onCancel={closeModal}
              onConfirm={async (outcome) => {
                await p.close.mutateAsync({ id: r.id, status: "rejected", outcome });
                closeModal();
                showBanner("Anfrage abgelehnt", `DS-${r.request_no}`, "success");
              }} />
          ),
        })} />
      </span>
    </li>
  );
};

const EraseConfirm = ({ onConfirm, onCancel }: { onConfirm: () => Promise<void>; onCancel: () => void }) => {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const { showBanner } = useBanner();
  return (
    <div className="flex flex-col gap-3 pt-2 text-sm">
      <p>Name, Kontaktdaten, Adresse, Geburtsdatum, Notizen, Aktivitätsnotizen und Nachweistexte werden unwiderruflich entfernt (auch beim zugehörigen Lead).
        Verträge, Produktion und Provisionen bleiben ohne Personenbezug erhalten.</p>
      <InputField label="Zur Bestätigung LÖSCHEN eingeben" placeholder="LÖSCHEN" value={text} onChange={setText} />
      <div className="flex gap-3">
        <Button text="Endgültig pseudonymisieren" variant="decline" isLoading={busy} isDisabled={text !== "LÖSCHEN"} onClick={async () => {
          setBusy(true);
          try { await onConfirm(); } catch (e) { showBanner("Nicht ausgeführt", errorText(e), "error"); } finally { setBusy(false); }
        }} />
        <Button text="Abbrechen" variant="secondary" onClick={onCancel} />
      </div>
    </div>
  );
};

const ConfirmAction = ({ message, confirmText, onConfirm, onCancel }: { message: string; confirmText: string; onConfirm: () => Promise<void>; onCancel: () => void }) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  return (
    <div className="flex flex-col gap-3 pt-2 text-sm">
      <p>{message}</p>
      {error && <p role="alert" className="text-color-error-text">{error}</p>}
      <ModalActions>
        <Button text="Abbrechen" variant="secondary" onClick={onCancel} />
        <Button text={confirmText} isLoading={busy} onClick={async () => {
          setBusy(true);
          setError(undefined);
          try { await onConfirm(); } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
        }} />
      </ModalActions>
    </div>
  );
};
