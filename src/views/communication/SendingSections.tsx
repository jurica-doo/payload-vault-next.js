"use client";

import { useState } from "react";
import { Button } from "../../components/button/Button";
import { DateInput } from "../../components/formFields/FormFields";
import { InputField } from "../../components/inputField/InputField";
import { ProvisionalRuleNotice } from "../../components/provisionalRuleNotice/ProvisionalRuleNotice";
import { ReasonConfirmForm } from "../../components/reasonConfirm/ReasonConfirmForm";
import { StatusBadge, type StatusMap } from "../../components/statusBadge/StatusBadge";
import { useAuth } from "../../context/AuthContext";
import { useBanner } from "../../context/banner/BannerContext";
import { useModal } from "../../context/modal/ModalContext";
import { usePermissions } from "../../hooks/permissions/usePermissions";
import { useEmailOps, useEmailTemplates } from "../../hooks/useEmail/useEmail";
import { berlinToday, formatDate, formatDateTime } from "../../utils/format";
import { Select } from "../leads/LeadForm";
import { SEND_STATUS, SUPPRESSION_REASON, card } from "./emailLabels";

const errText = (e: unknown) => (e instanceof Error ? e.message : "");
const DAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const CAMPAIGN_STATUS: StatusMap<string> = {
  draft: { label: "Entwurf", tone: "neutral" }, submitted: { label: "wartet auf Freigabe", tone: "warning" },
  active: { label: "aktiv", tone: "success" }, paused: { label: "pausiert", tone: "warning" },
  completed: { label: "abgeschlossen", tone: "neutral" }, cancelled: { label: "abgebrochen", tone: "neutral" },
};

/** Global kill switch and send window (§10.2). Off until Gate E. */
export const SwitchSection = () => {
  const { permissions } = usePermissions();
  const ops = useEmailOps(true);
  const { openModal, closeModal } = useModal();
  const s = ops.status.data;
  const [w, setW] = useState<{ start: string; end: string; limit: string; days: number[] } | null>(null);
  if (!s) return <section className={card}><p className="text-sm">Lädt…</p></section>;
  const form = w ?? { start: s.window_start, end: s.window_end, limit: String(s.daily_limit), days: s.window_days };
  const confirm = (title: string, message: string, run: (reason: string) => Promise<unknown>) => openModal({
    title, children: <ReasonConfirmForm message={message} onCancel={closeModal} onConfirm={async (r) => { await run(r); closeModal(); }} />,
  });
  return (
    <section className={card}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold">Automatischer Versand</h2>
        <StatusBadge status={s.enabled ? "on" : "off"} map={{ on: { label: "eingeschaltet", tone: "success" }, off: { label: "ausgeschaltet", tone: "error" } }} />
      </div>
      {!s.enabled && <ProvisionalRuleNotice decisionId="OD-11" text="Versand aus. Einschalten erst nach Gate E (Vorlagen, Rechtsgrundlagen, Sperrliste und Freigaben geprüft) und mit gewähltem E-Mail-Anbieter." />}
      <p className="text-sm text-color-text-secondary">
        Letzte 7 Tage: {Object.entries(s.last_7_days).map(([k, n]) => `${SEND_STATUS[k]?.label ?? k} ${n}`).join(" · ") || "nichts"}
        {s.enabled && !s.in_window && " · gerade außerhalb des Versandfensters"}
      </p>
      <div className="flex flex-wrap gap-3">
        {s.enabled ? (
          <Button text="Versand stoppen" variant="decline" onClick={() => confirm("Versand stoppen", "Geplante Mails bleiben im Protokoll und werden nicht versendet.", (reason) => ops.setEnabled.mutateAsync({ enabled: false, reason }))} />
        ) : permissions.isAdmin && (
          <Button text="Versand einschalten" variant="approve" onClick={() => confirm("Versand einschalten", "Ab jetzt werden geplante Mails im Versandfenster verschickt. Nur nach bestandenem Gate E.", (reason) => ops.setEnabled.mutateAsync({ enabled: true, reason }))} />
        )}
      </div>
      <div className="flex flex-wrap items-end gap-3 border-t border-color-border-light pt-3">
        <InputField label="Fenster von" placeholder="09:00" value={form.start} onChange={(v) => setW({ ...form, start: v })} />
        <InputField label="bis" placeholder="18:00" value={form.end} onChange={(v) => setW({ ...form, end: v })} />
        <InputField label="Tageslimit" placeholder="500" value={form.limit} onChange={(v) => setW({ ...form, limit: v })} />
        <fieldset className="flex gap-2 text-sm">
          {DAYS.map((d, i) => (
            <label key={d} className="flex items-center gap-1">
              <input type="checkbox" checked={form.days.includes(i + 1)}
                onChange={(e) => setW({ ...form, days: e.target.checked ? [...form.days, i + 1].sort() : form.days.filter((x) => x !== i + 1) })} />{d}
            </label>
          ))}
        </fieldset>
        <Button text="Fenster speichern" variant="secondary" isDisabled={!w || !/^\d{2}:\d{2}$/.test(form.start) || !/^\d{2}:\d{2}$/.test(form.end) || form.start >= form.end || !(Number(form.limit) > 0) || form.days.length === 0}
          onClick={() => confirm("Versandfenster ändern", "Gilt für alle künftigen Versände (Uhrzeit Europe/Berlin).",
            async (reason) => { await ops.setWindow.mutateAsync({ start: form.start, end: form.end, days: form.days, dailyLimit: Number(form.limit), reason }); setW(null); })} />
      </div>
    </section>
  );
};

/** Campaigns with four-eyes approval; approval pins the template version (§10.2). */
export const CampaignsSection = () => {
  const { user } = useAuth();
  const ops = useEmailOps(true);
  const { data: tpl } = useEmailTemplates(true);
  const { openModal, closeModal } = useModal();
  const { showBanner } = useBanner();
  const [f, setF] = useState({ name: "", template: "", kind: "birthday", sendOn: "" });
  const templates = (tpl?.templates ?? []).filter((t) => !t.archived_at);
  const templateId = f.template || templates[0]?.id || "";
  const versionNo = (id: string | null) => tpl?.versions.find((v) => v.id === id)?.version;
  const run = async (fn: () => Promise<unknown>) => { try { await fn(); } catch (e) { showBanner("Nicht ausgeführt", errText(e), "error"); } };
  const withReason = (id: string, action: string, title: string) => openModal({
    title, children: <ReasonConfirmForm message="Wird mit Begründung protokolliert." onCancel={closeModal}
      onConfirm={async (reason) => { await ops.campaignAction.mutateAsync({ id, action, reason }); closeModal(); }} />,
  });
  return (
    <section className={card}>
      <h2 className="text-base font-semibold">Kampagnen</h2>
      <ul className="flex flex-col gap-2 text-sm">
        {(ops.campaigns.data ?? []).map((k) => (
          <li key={k.id} className="flex flex-wrap items-center justify-between gap-2">
            <span>
              <span className="font-semibold">{k.name}</span> · {k.kind === "birthday" ? "täglich (Geburtstage)" : `am ${formatDate(k.send_on)}`}
              {k.template_version_id && <span className="text-xs text-color-text-subtle"> · Vorlage v{versionNo(k.template_version_id)}</span>}
            </span>
            <span className="flex items-center gap-2 text-xs font-semibold">
              <StatusBadge status={k.status} map={CAMPAIGN_STATUS} />
              {k.status === "draft" && <button type="button" className="cursor-pointer text-color-text-accent" onClick={() => run(() => ops.campaignAction.mutateAsync({ id: k.id, action: "submit" }))}>Einreichen</button>}
              {k.status === "submitted" && k.created_by !== user?.id && (
                <>
                  <button type="button" className="cursor-pointer text-color-success-text" onClick={() => run(() => ops.campaignAction.mutateAsync({ id: k.id, action: "approve" }))}>Freigeben</button>
                  <button type="button" className="cursor-pointer text-color-text-subtle" onClick={() => withReason(k.id, "reject", "Kampagne zurückgeben")}>Zurückgeben</button>
                </>
              )}
              {k.status === "active" && <button type="button" className="cursor-pointer text-color-text-accent" onClick={() => run(() => ops.campaignAction.mutateAsync({ id: k.id, action: "pause" }))}>Pausieren</button>}
              {k.status === "paused" && <button type="button" className="cursor-pointer text-color-text-accent" onClick={() => run(() => ops.campaignAction.mutateAsync({ id: k.id, action: "resume" }))}>Fortsetzen</button>}
              {["draft", "submitted", "active", "paused"].includes(k.status) && (
                <button type="button" className="cursor-pointer text-color-error-text" onClick={() => withReason(k.id, "cancel", "Kampagne abbrechen")}>Abbrechen</button>
              )}
            </span>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-end gap-3 border-t border-color-border-light pt-3">
        <InputField label="Name" placeholder="z. B. Weihnachten 2026" value={f.name} onChange={(v) => setF({ ...f, name: v })} />
        <Select label="Vorlage" value={templateId} onChange={(v) => setF({ ...f, template: v })} options={templates.map((t) => ({ value: t.id, label: t.name }))} />
        <Select label="Art" value={f.kind} onChange={(v) => setF({ ...f, kind: v })} options={[{ value: "birthday", label: "Geburtstage (täglich)" }, { value: "one_off", label: "einmalig an einem Datum" }]} />
        {f.kind === "one_off" && <DateInput label="Versanddatum" value={f.sendOn} onChange={(v) => setF({ ...f, sendOn: v })} min={berlinToday()} />}
        <Button text="Anlegen" variant="secondary" isDisabled={f.name.trim().length < 3 || !templateId || (f.kind === "one_off" && !f.sendOn)}
          onClick={() => run(async () => { await ops.saveCampaign.mutateAsync({ name: f.name, templateId, kind: f.kind, sendOn: f.kind === "one_off" ? f.sendOn : null }); setF({ ...f, name: "" }); })} />
      </div>
      <p className="text-xs text-color-text-subtle">Freigabe durch eine zweite Person. Die bei der Freigabe aktive Vorlagenversion wird festgeschrieben; spätere Vorlagenänderungen betreffen die Kampagne nicht.</p>
    </section>
  );
};

export const TestSendButton = ({ versionId }: { versionId: string }) => {
  const ops = useEmailOps(true);
  const { showBanner } = useBanner();
  return (
    <Button text="Testmail an mich" variant="secondary" isLoading={ops.sendTest.isPending} onClick={async () => {
      try {
        await ops.sendTest.mutateAsync(versionId);
        showBanner("Testmail geplant", "Sie geht an Ihre eigene Adresse, sobald ein E-Mail-Anbieter angebunden ist.", "success");
      } catch (e) {
        showBanner("Nicht geplant", errText(e), "error");
      }
    }} />
  );
};

/** Suppression list (§10.2): addresses that never get automated mail. */
export const SuppressionsSection = () => {
  const ops = useEmailOps(true);
  const { openModal, closeModal } = useModal();
  const { showBanner } = useBanner();
  const [email, setEmail] = useState("");
  return (
    <section className={card}>
      <h2 className="text-base font-semibold">Sperrliste</h2>
      <div className="flex flex-wrap items-end gap-3">
        <InputField label="E-Mail-Adresse sperren" placeholder="name@beispiel.de" value={email} onChange={setEmail} />
        <Button text="Sperren" variant="secondary" isDisabled={!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())} onClick={async () => {
          try { await ops.setSuppression.mutateAsync({ email, suppressed: true }); setEmail(""); } catch (e) { showBanner("Nicht gespeichert", errText(e), "error"); }
        }} />
      </div>
      <ul className="text-sm">
        {(ops.suppressions.data ?? []).map((x) => (
          <li key={x.email} className="flex items-center justify-between gap-2">
            <span>{x.email} <span className="text-xs text-color-text-subtle">· {x.reason} · {formatDateTime(x.created_at)}</span></span>
            <button type="button" className="cursor-pointer text-xs text-color-text-subtle" onClick={() => openModal({
              title: "Sperre aufheben",
              children: <ReasonConfirmForm message="Nur aufheben, wenn die Adresse korrigiert wurde oder die Person zugestimmt hat." onCancel={closeModal}
                onConfirm={async (note) => { await ops.setSuppression.mutateAsync({ email: x.email, suppressed: false, note }); closeModal(); }} />,
            })}>Aufheben</button>
          </li>
        ))}
      </ul>
    </section>
  );
};

/** Every attempted send with its outcome or suppression reason (§14.6). */
export const SendLogSection = () => {
  const ops = useEmailOps(true);
  const [filter, setFilter] = useState("");
  const rows = (ops.log.data ?? []).filter((r) => !filter || r.status === filter);
  return (
    <section className={card}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-base font-semibold">Versandprotokoll</h2>
        <Select label="Status" value={filter} onChange={setFilter} options={[{ value: "", label: "alle" }, ...Object.entries(SEND_STATUS).map(([value, s]) => ({ value, label: s.label }))]} />
      </div>
      {rows.length === 0 ? <p className="text-sm text-color-text-subtle">Keine Einträge.</p> : (
        <ul className="text-xs">
          {rows.map((r) => (
            <li key={r.id} className="border-b border-color-border-light py-1 last:border-0">
              {formatDateTime(r.created_at)} · {r.mode === "test" ? "Test" : `Anlass ${formatDate(r.occasion_date)}`} · <StatusBadge status={r.status} map={SEND_STATUS} />
              {r.suppression_reason && ` · ${SUPPRESSION_REASON[r.suppression_reason] ?? r.suppression_reason}`}
              {r.legal_basis && ` · Grundlage ${r.legal_basis}`}
              {r.last_error && ` · ${r.last_error}`}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};
