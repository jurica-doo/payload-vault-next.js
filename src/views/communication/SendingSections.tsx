"use client";

import { useState } from "react";
import { ActionMenu, type ActionMenuItem } from "../../components/actionMenu/ActionMenu";
import { Button } from "../../components/button/Button";
import { DataTable } from "../../components/dataTable/DataTable";
import { Form } from "../../components/form/Form";
import { DateInput, TimeInput } from "../../components/formFields/FormFields";
import { UploadIcon } from "../../components/icons";
import { InputField } from "../../components/inputField/InputField";
import { LoadingState } from "../../components/loadingState/LoadingState";
import { Pagination } from "../../components/pagination/Pagination";
import { pageAfterResize, usePageSize } from "../../components/pagination/usePagination";
import { ProvisionalRuleNotice } from "../../components/provisionalRuleNotice/ProvisionalRuleNotice";
import { ReasonConfirmForm } from "../../components/reasonConfirm/ReasonConfirmForm";
import { SearchBar } from "../../components/searchBar/SearchBar";
import { Select } from "../../components/select/Select";
import { StatusBadge, type StatusMap } from "../../components/statusBadge/StatusBadge";
import { useAuth } from "../../context/AuthContext";
import { useBanner } from "../../context/banner/BannerContext";
import { useModal } from "../../context/modal/ModalContext";
import { BASIS_LABEL } from "../../domain/consent";
import { usePermissions } from "../../hooks/permissions/usePermissions";
import { customerNo } from "../../hooks/useCustomers/useCustomers";
import { useEmailOps, useEmailTemplates, useSendLog, useSuppressions, type Campaign, type SendLogEntry } from "../../hooks/useEmail/useEmail";
import { errorText } from "../../utils/dbErrors";
import { berlinToday, formatDate, formatDateTime, formatNumber } from "../../utils/format";
import { BLOCK_REASON, BLOCK_REASON_OPTIONS, SEND_STATUS, SUPPRESSION_REASON, card } from "./emailLabels";
import { SuppressionImport } from "./SuppressionImport";

const DAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const CAMPAIGN_STATUS: StatusMap<string> = {
  draft: { label: "Entwurf", tone: "neutral" }, submitted: { label: "wartet auf Freigabe", tone: "warning" },
  active: { label: "aktiv", tone: "success" }, paused: { label: "pausiert", tone: "warning" },
  completed: { label: "abgeschlossen", tone: "neutral" }, cancelled: { label: "abgebrochen", tone: "neutral" },
};
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Global kill switch and send window (§10.2). Off until Gate E. */
export const SwitchSection = () => {
  const { permissions } = usePermissions();
  const ops = useEmailOps(true);
  const { openModal, closeModal } = useModal();
  const { showBanner } = useBanner();
  const s = ops.status.data;
  const [w, setW] = useState<{ start: string; end: string; limit: string; days: number[] } | null>(null);
  if (ops.status.error) return <section className={card}><p role="alert" className="text-sm text-color-error-text">{errorText(ops.status.error)}</p></section>;
  if (!s) return <section className={card}><LoadingState /></section>;
  const form = w ?? { start: s.window_start.slice(0, 5), end: s.window_end.slice(0, 5), limit: String(s.daily_limit), days: s.window_days };
  const limit = Number(form.limit);
  const windowProblem = !TIME.test(form.start) || !TIME.test(form.end) ? "Bitte Uhrzeiten von 00:00 bis 23:59 eingeben."
    : form.start >= form.end ? "Das Fenster muss vor seinem Ende beginnen."
    : !(Number.isInteger(limit) && limit > 0) ? "Das Tageslimit muss eine ganze Zahl über 0 sein."
    : form.days.length === 0 ? "Bitte mindestens einen Versandtag wählen." : null;
  const confirm = (title: string, message: string, run: (reason: string) => Promise<unknown>, done: string) => openModal({
    title, children: <ReasonConfirmForm message={message} onCancel={closeModal} onConfirm={async (r) => { await run(r); closeModal(); showBanner(done, "Die Änderung ist mit Ihrer Begründung protokolliert.", "success"); }} />,
  });
  return (
    <section className={card}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold">Automatischer Versand</h2>
        <StatusBadge status={s.enabled ? "on" : "off"} map={{ on: { label: "eingeschaltet", tone: "success" }, off: { label: "ausgeschaltet", tone: "error" } }} />
      </div>
      {!s.enabled && <ProvisionalRuleNotice decisionId="OD-11" text="Versand aus. Einschalten erst nach Gate E (Vorlagen, Rechtsgrundlagen, Sperrliste und Freigaben geprüft) und mit gewähltem E-Mail-Anbieter." />}
      <p className="text-sm text-color-text-secondary">
        Letzte 7 Tage: {Object.entries(s.last_7_days).map(([k, n]) => `${SEND_STATUS[k]?.label ?? k} ${formatNumber(n)}`).join(" · ") || "nichts"}
        {s.enabled && !s.in_window && " · gerade außerhalb des Versandfensters"}
      </p>
      <div className="flex flex-wrap gap-3">
        {s.enabled ? (
          <Button text="Versand stoppen" variant="decline" isDisabled={!permissions.hasMfa}
            onClick={() => confirm("Versand stoppen", "Geplante Mails bleiben im Protokoll und werden nicht versendet.", (reason) => ops.setEnabled.mutateAsync({ enabled: false, reason }), "Versand gestoppt")} />
        ) : permissions.isAdmin && (
          <Button text="Versand einschalten" variant="approve" isDisabled={!permissions.hasMfa}
            onClick={() => confirm("Versand einschalten", "Ab jetzt werden geplante Mails im Versandfenster verschickt. Nur nach bestandenem Gate E.", (reason) => ops.setEnabled.mutateAsync({ enabled: true, reason }), "Versand eingeschaltet")} />
        )}
      </div>
      <Form className="flex flex-col gap-3 border-t border-color-border-light pt-3"
        onSubmit={() => confirm("Versandfenster ändern", "Gilt für alle künftigen Versände (Uhrzeit Europe/Berlin).",
          async (reason) => { await ops.setWindow.mutateAsync({ start: form.start, end: form.end, days: form.days, dailyLimit: limit, reason }); setW(null); }, "Versandfenster gespeichert")}>
        <div className="grid gap-3 sm:grid-cols-3">
          <TimeInput label="Fenster von" value={form.start} onChange={(v) => setW({ ...form, start: v })} isRequired />
          <TimeInput label="Fenster bis" value={form.end} onChange={(v) => setW({ ...form, end: v })} isRequired />
          <InputField label="Tageslimit (Mails)" placeholder="500" type="number" value={form.limit} onChange={(v) => setW({ ...form, limit: v })} isRequired />
        </div>
        <fieldset className="flex flex-wrap gap-3 text-sm">
          <legend className="mb-1 text-[14px] font-semibold text-color-text-secondary">Versandtage</legend>
          {DAYS.map((d, i) => (
            <label key={d} className="flex items-center gap-1">
              <input type="checkbox" checked={form.days.includes(i + 1)}
                onChange={(e) => setW({ ...form, days: e.target.checked ? [...form.days, i + 1].sort() : form.days.filter((x) => x !== i + 1) })} />{d}
            </label>
          ))}
        </fieldset>
        {w && windowProblem && <p role="alert" className="text-sm text-color-error-text">{windowProblem}</p>}
        <div className="flex flex-wrap gap-3">
          <Button type="submit" text="Fenster speichern" variant="secondary" isDisabled={!w || Boolean(windowProblem) || !permissions.hasMfa} />
          {w && <Button text="Verwerfen" variant="ghost" onClick={() => setW(null)} />}
        </div>
      </Form>
    </section>
  );
};

const ACTION_DONE: Record<string, [title: string, failed: string, text: string]> = {
  submit: ["Kampagne eingereicht", "Kampagne nicht eingereicht", "Eine zweite Person muss sie freigeben."],
  approve: ["Kampagne freigegeben", "Kampagne nicht freigegeben", "Die aktuelle Vorlagenversion ist festgeschrieben."],
  reject: ["Kampagne zurückgegeben", "Kampagne nicht zurückgegeben", "Sie ist wieder ein Entwurf."],
  pause: ["Kampagne pausiert", "Kampagne nicht pausiert", "Bis zum Fortsetzen wird nichts mehr geplant."],
  resume: ["Kampagne fortgesetzt", "Kampagne nicht fortgesetzt", "Ab dem nächsten Lauf wird wieder geplant."],
  cancel: ["Kampagne abgebrochen", "Kampagne nicht abgebrochen", "Noch geplante Mails werden nicht versendet."],
};

/** Campaigns with four-eyes approval; approval pins the template version (§10.2). */
export const CampaignsSection = () => {
  const { user } = useAuth();
  const { permissions } = usePermissions();
  const ops = useEmailOps(true);
  const { data: tpl } = useEmailTemplates(true);
  const { openModal, closeModal } = useModal();
  const { showBanner } = useBanner();
  const [f, setF] = useState({ name: "", template: "", kind: "birthday", sendOn: "" });
  const templates = (tpl?.templates ?? []).filter((t) => !t.archived_at);
  const templateId = f.template || templates[0]?.id || "";
  const versionNo = (id: string | null) => tpl?.versions.find((v) => v.id === id)?.version;
  const act = async (id: string, action: string, reason?: string) => {
    try {
      await ops.campaignAction.mutateAsync({ id, action, reason });
      showBanner(ACTION_DONE[action][0], ACTION_DONE[action][2], "success");
    } catch (e) {
      showBanner(ACTION_DONE[action][1], errorText(e), "error");
    }
  };
  const withReason = (id: string, action: string, title: string, message: string) => openModal({
    title, children: <ReasonConfirmForm message={message} variant="decline" confirmText={title} onCancel={closeModal}
      onConfirm={async (reason) => { await ops.campaignAction.mutateAsync({ id, action, reason }); closeModal(); showBanner(ACTION_DONE[action][0], ACTION_DONE[action][2], "success"); }} />,
  });
  const primary = (k: Campaign) => {
    if (k.status === "draft") return <Button size="small" text="Einreichen" onClick={() => act(k.id, "submit")} isDisabled={!permissions.hasMfa} />;
    if (k.status === "submitted" && k.created_by !== user?.id) return <Button size="small" variant="approve" text="Freigeben" onClick={() => act(k.id, "approve")} isDisabled={!permissions.hasMfa} />;
    if (k.status === "active") return <Button size="small" variant="secondary" text="Pausieren" onClick={() => act(k.id, "pause")} isDisabled={!permissions.hasMfa} />;
    if (k.status === "paused") return <Button size="small" variant="secondary" text="Fortsetzen" onClick={() => act(k.id, "resume")} isDisabled={!permissions.hasMfa} />;
    return null;
  };
  const menu = (k: Campaign): ActionMenuItem[] => [
    { label: "Zurückgeben…", hidden: !(k.status === "submitted" && k.created_by !== user?.id), disabled: !permissions.hasMfa,
      onClick: () => withReason(k.id, "reject", "Kampagne zurückgeben", "Die Kampagne geht als Entwurf zurück. Die Begründung wird protokolliert.") },
    { label: "Kampagne abbrechen…", danger: true, hidden: !["draft", "submitted", "active", "paused"].includes(k.status), disabled: !permissions.hasMfa,
      onClick: () => withReason(k.id, "cancel", "Kampagne abbrechen", "Die Kampagne endet endgültig; noch geplante Mails werden nicht mehr versendet. Die Begründung wird protokolliert.") },
  ];
  const campaigns = ops.campaigns.data ?? [];
  return (
    <section className={card}>
      <h2 className="text-base font-semibold">Kampagnen</h2>
      {ops.campaigns.error ? <p role="alert" className="text-sm text-color-error-text">{errorText(ops.campaigns.error)}</p>
        : campaigns.length === 0 ? <p className="text-sm text-color-text-subtle">Noch keine Kampagne angelegt.</p> : (
        <ul className="flex flex-col divide-y divide-color-border-light text-sm">
          {campaigns.map((k) => (
            <li key={k.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span className="min-w-0">
                <span className="font-semibold break-words">{k.name}</span> · {k.kind === "birthday" ? "täglich (Geburtstage)" : `am ${formatDate(k.send_on)}`}
                {k.template_version_id && <span className="text-xs text-color-text-subtle"> · Vorlage v{versionNo(k.template_version_id)}</span>}
              </span>
              <span className="flex items-center gap-2">
                <StatusBadge status={k.status} map={CAMPAIGN_STATUS} />
                {k.status === "submitted" && k.created_by === user?.id && <span className="text-xs text-color-text-subtle">Freigabe durch eine zweite Person</span>}
                {primary(k)}
                {menu(k).some((i) => !i.hidden) && <ActionMenu label={`Weitere Aktionen für ${k.name}`} items={menu(k)} />}
              </span>
            </li>
          ))}
        </ul>
      )}
      <Form className="flex flex-col gap-3 border-t border-color-border-light pt-3" onSubmit={async () => {
        try {
          await ops.saveCampaign.mutateAsync({ name: f.name.trim(), templateId, kind: f.kind, sendOn: f.kind === "one_off" ? f.sendOn : null });
          setF({ ...f, name: "", sendOn: "" });
          showBanner("Kampagne angelegt", "Reichen Sie sie zur Freigabe ein, damit sie versendet wird.", "success");
        } catch (e) {
          showBanner("Kampagne nicht angelegt", errorText(e), "error");
        }
      }}>
        <h3 className="text-sm font-semibold">Neue Kampagne</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <InputField label="Name" placeholder="z. B. Weihnachten 2026" value={f.name} onChange={(v) => setF({ ...f, name: v })} isRequired />
          <Select label="Vorlage" value={templateId} onChange={(v) => setF({ ...f, template: v })}
            options={templates.length ? templates.map((t) => ({ value: t.id, label: t.name })) : [{ value: "", label: "noch keine Vorlage" }]} />
          <Select label="Art" value={f.kind} onChange={(v) => setF({ ...f, kind: v })} options={[{ value: "birthday", label: "Geburtstage (täglich)" }, { value: "one_off", label: "einmalig an einem Datum" }]} />
          {f.kind === "one_off" && <DateInput label="Versanddatum" value={f.sendOn} onChange={(v) => setF({ ...f, sendOn: v })} min={berlinToday()} isRequired />}
        </div>
        <div>
          <Button type="submit" text="Kampagne anlegen" variant="secondary"
            isDisabled={!permissions.hasMfa || f.name.trim().length < 3 || !templateId || (f.kind === "one_off" && !f.sendOn)} />
        </div>
      </Form>
      <p className="text-xs text-color-text-subtle">Freigabe durch eine zweite Person. Die bei der Freigabe aktive Vorlagenversion wird festgeschrieben; spätere Vorlagenänderungen betreffen die Kampagne nicht. Es kann nur eine Geburtstagskampagne gleichzeitig aktiv sein.</p>
    </section>
  );
};

export const TestSendButton = ({ versionId }: { versionId: string }) => {
  const { permissions } = usePermissions();
  const ops = useEmailOps(true);
  const { showBanner } = useBanner();
  return (
    <Button text="Testmail an mich" variant="secondary" isDisabled={!permissions.hasMfa} onClick={async () => {
      try {
        await ops.sendTest.mutateAsync(versionId);
        showBanner("Testmail geplant", "Sie geht an Ihre eigene Adresse, sobald ein E-Mail-Anbieter angebunden ist.", "success");
      } catch (e) {
        showBanner("Testmail nicht geplant", errorText(e), "error");
      }
    }} />
  );
};

/** Suppression list (§10.2): addresses that never get automated mail. Searched and paged in the database. */
export const SuppressionsSection = () => {
  const { permissions } = usePermissions();
  const ops = useEmailOps(true);
  const { openModal, closeModal } = useModal();
  const { showBanner } = useBanner();
  const [email, setEmail] = useState("");
  const [reason, setReason] = useState("manual");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = usePageSize();
  const list = useSuppressions(true, { search, page, pageSize });
  const canWrite = permissions.hasMfa;
  const emailOk = EMAIL.test(email.trim());
  return (
    <section className={card}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold">Sperrliste</h2>
        <Button text="CSV importieren" variant="secondary" size="small" icon={UploadIcon} isDisabled={!canWrite}
          onClick={() => openModal({ title: "Sperrliste importieren", size: "large", children: <SuppressionImport onDone={closeModal} /> })} />
      </div>
      <Form className="flex flex-col gap-3" onSubmit={async () => {
        try {
          await ops.setSuppression.mutateAsync({ email: email.trim(), suppressed: true, reason });
          showBanner("Adresse gesperrt", "Ist sie schon gesperrt, wird nur der Grund aktualisiert.", "success");
          setEmail("");
        } catch (e) {
          showBanner("Adresse nicht gesperrt", errorText(e), "error");
        }
      }}>
        <div className="grid gap-3 sm:grid-cols-2">
          <InputField label="E-Mail-Adresse sperren" placeholder="name@beispiel.de" type="email" value={email} onChange={setEmail}
            error={email.trim() && !emailOk ? "Keine gültige E-Mail-Adresse." : undefined} />
          <Select label="Grund" value={reason} onChange={setReason} options={BLOCK_REASON_OPTIONS} />
        </div>
        <div><Button type="submit" text="Sperren" variant="secondary" isDisabled={!emailOk || !canWrite} /></div>
      </Form>
      <div className="border-t border-color-border-light pt-3">
        <SearchBar value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Adresse suchen" title="Sperrliste durchsuchen" />
      </div>
      {list.error ? <p role="alert" className="text-sm text-color-error-text">{errorText(list.error)}</p>
        : list.isLoading ? <LoadingState />
        : (list.data?.rows.length ?? 0) === 0 ? <p className="text-sm text-color-text-subtle">{search ? "Keine gesperrte Adresse passt zur Suche." : "Keine Adresse gesperrt."}</p> : (
        <ul className="flex flex-col divide-y divide-color-border-light text-sm">
          {list.data!.rows.map((x) => (
            <li key={x.email} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span className="min-w-0 break-all">
                {x.email}
                <span className="block text-xs text-color-text-subtle">
                  {BLOCK_REASON[x.reason] ?? x.reason} · seit {formatDateTime(x.created_at)}{x.note && ` · ${x.note}`}
                </span>
              </span>
              <Button text="Aufheben" variant="ghost" size="small" isDisabled={!canWrite} ariaLabel={`Sperre für ${x.email} aufheben`} onClick={() => openModal({
                title: "Sperre aufheben",
                children: <ReasonConfirmForm message={`${x.email} bekommt wieder automatische Mails. Nur aufheben, wenn die Adresse korrigiert wurde oder die Person zugestimmt hat.`} onCancel={closeModal}
                  onConfirm={async (note) => { await ops.setSuppression.mutateAsync({ email: x.email, suppressed: false, note }); closeModal(); showBanner("Sperre aufgehoben", "Die Adresse kann wieder automatische Mails bekommen.", "success"); }} />,
              })} />
            </li>
          ))}
        </ul>
      )}
      {list.data && (
        <Pagination page={page} pageSize={pageSize} total={list.data.total} onPageChange={setPage}
          onPageSizeChange={(size) => { setPage(pageAfterResize(page, pageSize, size)); setPageSize(size); }} />
      )}
    </section>
  );
};

const logNote = (r: SendLogEntry) => {
  if (r.suppression_reason) return SUPPRESSION_REASON[r.suppression_reason] ?? r.suppression_reason;
  if (r.status === "bounced") return "Vom E-Mail-Anbieter als unzustellbar gemeldet; Adresse gesperrt";
  if (r.last_error) return "Fehler beim E-Mail-Anbieter";
  if (r.legal_basis) return `Rechtsgrundlage: ${BASIS_LABEL[r.legal_basis] ?? r.legal_basis}`;
  return "";
};

/** Every attempted send with its outcome or suppression reason (§14.6). Filtered and paged in the database. */
export const SendLogSection = () => {
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = usePageSize();
  const log = useSendLog(true, { status, page, pageSize });
  return (
    <section className={card}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-base font-semibold">Versandprotokoll</h2>
        <Select label="Status" value={status} onChange={(v) => { setStatus(v); setPage(1); }}
          options={[{ value: "", label: "alle" }, ...Object.entries(SEND_STATUS).map(([value, s]) => ({ value, label: s.label }))]} />
      </div>
      <DataTable
        caption="Versandprotokoll"
        rows={log.data?.rows ?? []}
        getRowId={(r) => r.id}
        isLoading={log.isLoading}
        error={log.error ? errorText(log.error) : null}
        emptyMessage={status ? "Keine Einträge mit diesem Status." : "Noch keine Einträge."}
        pagination={log.data ? {
          page, pageSize, total: log.data.total, onPageChange: setPage,
          onPageSizeChange: (size) => { setPage(pageAfterResize(page, pageSize, size)); setPageSize(size); },
        } : undefined}
        columns={[
          { id: "at", header: "Zeitpunkt", cell: (r) => formatDateTime(r.created_at) },
          { id: "customer", header: "Kunde", cell: (r) => (r.mode === "test" ? "Testmail" : r.customers ? customerNo(r.customers.customer_no) : "–") },
          { id: "occasion", header: "Anlass", cell: (r) => (r.mode === "test" ? "–" : formatDate(r.occasion_date)), hideOnMobile: true },
          { id: "status", header: "Status", cell: (r) => <StatusBadge status={r.status} map={SEND_STATUS} /> },
          { id: "note", header: "Hinweis", cell: (r) => <span title={r.last_error ?? undefined}>{logNote(r)}</span>, hideOnMobile: true },
        ]}
      />
    </section>
  );
};
