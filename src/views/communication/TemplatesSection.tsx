"use client";

import { errorText } from "../../utils/dbErrors";
import { useState } from "react";
import { Button } from "../../components/button/Button";
import { Form } from "../../components/form/Form";
import { TextArea } from "../../components/formFields/FormFields";
import { InputField } from "../../components/inputField/InputField";
import { ReasonConfirmForm } from "../../components/reasonConfirm/ReasonConfirmForm";
import { StatusBadge, type StatusMap } from "../../components/statusBadge/StatusBadge";
import { useAuth } from "../../context/AuthContext";
import { usePermissions } from "../../hooks/permissions/usePermissions";
import { useBanner } from "../../context/banner/BannerContext";
import { useModal } from "../../context/modal/ModalContext";
import { useEmailTemplates, type EmailTemplate, type TemplateVersion } from "../../hooks/useEmail/useEmail";
import { MERGE_FIELDS, MERGE_FIELD_LABEL, SAMPLE_VALUES, checkTemplateText, renderTemplate } from "../../domain/emailTemplate";
import { BASIS_LABEL } from "../../domain/consent";
import { formatDateTime } from "../../utils/format";
import { Select } from "../../components/select/Select";
import { TestSendButton } from "./SendingSections";
import { card } from "./emailLabels";


export const PURPOSE_LABEL: Record<string, string> = {
  birthday: "Geburtstag", holiday: "Feiertag", year_end: "Jahresende", service: "Service", marketing: "Werbung",
};
const VERSION_STATUS: StatusMap<string> = {
  draft: { label: "Entwurf", tone: "neutral" }, submitted: { label: "wartet auf Freigabe", tone: "warning" },
  approved: { label: "freigegeben", tone: "success" }, rejected: { label: "abgelehnt", tone: "error" }, retired: { label: "ersetzt", tone: "neutral" },
};

/**
 * Templates (§10.2): plain text with whitelisted merge fields, live preview,
 * four-eyes approval. Only approved versions can be used by campaigns.
 */
export const TemplatesSection = () => {
  const { data, error, saveTemplate } = useEmailTemplates(true);
  const { permissions } = usePermissions();
  const { showBanner } = useBanner();
  const [selected, setSelected] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [purpose, setPurpose] = useState("birthday");
  const templates = data?.templates ?? [];
  const current = templates.find((t) => t.id === selected) ?? templates[0];

  return (
    <section className={card}>
      <h2 className="text-base font-semibold">Vorlagen</h2>
      {error && <p role="alert" className="text-sm text-color-error-text">{errorText(error)}</p>}
      <Form className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-4" onSubmit={async () => {
        try {
          setSelected(await saveTemplate.mutateAsync({ id: null, name: name.trim(), purpose, allowedBases: ["consent"] }));
          setName("");
          showBanner("Vorlage angelegt", "Schreiben Sie jetzt Betreff und Text und reichen Sie den Entwurf zur Freigabe ein.", "success");
        } catch (e) {
          showBanner("Vorlage nicht angelegt", errorText(e), "error");
        }
      }}>
        <Select label="Vorlage" value={current?.id ?? ""} onChange={setSelected}
          options={templates.length ? templates.map((t) => ({ value: t.id, label: `${t.name} (${PURPOSE_LABEL[t.purpose]})` })) : [{ value: "", label: "noch keine" }]} />
        <InputField label="Neue Vorlage" placeholder="z. B. Geburtstag 2027" value={name} onChange={setName} />
        <Select label="Anlass" value={purpose} onChange={setPurpose} options={Object.entries(PURPOSE_LABEL).map(([value, label]) => ({ value, label }))} />
        <div><Button type="submit" text="Vorlage anlegen" variant="secondary" isDisabled={name.trim().length < 3 || name.trim().length > 100 || !permissions.hasMfa} /></div>
      </Form>
      {current && <TemplateEditor key={current.id} template={current} versions={(data?.versions ?? []).filter((v) => v.template_id === current.id)} />}
    </section>
  );
};

const TemplateEditor = ({ template, versions }: { template: EmailTemplate; versions: TemplateVersion[] }) => {
  const { user } = useAuth();
  const { permissions } = usePermissions();
  const { saveTemplate, saveDraft, submit, decide } = useEmailTemplates(true);
  const { openModal, closeModal } = useModal();
  const { showBanner } = useBanner();
  const open = versions.find((v) => v.status === "draft" || v.status === "submitted");
  const active = versions.find((v) => v.id === template.active_version_id);
  const base = open ?? active;
  const [subject, setSubject] = useState(base?.subject ?? "");
  const [body, setBody] = useState(base?.body ?? "");
  const [bases, setBases] = useState<string[]>(template.allowed_bases);
  const problem = checkTemplateText(subject) ?? checkTemplateText(body);
  const preview = renderTemplate(subject, body, SAMPLE_VALUES);
  const run = async (fn: () => Promise<unknown>, done: [title: string, text: string], failed: string) => {
    try {
      await fn();
      showBanner(done[0], done[1], "success");
    } catch (e) {
      showBanner(failed, errorText(e), "error");
    }
  };
  const editable = !open || open.status === "draft";
  const canWrite = permissions.hasMfa;
  const basesChanged = [...bases].sort().join() !== [...template.allowed_bases].sort().join();
  const lengthProblem = subject.trim().length > 200 ? "Der Betreff darf höchstens 200 Zeichen lang sein."
    : body.trim().length > 10000 ? "Der Text darf höchstens 10.000 Zeichen lang sein." : null;

  return (
    <div className="flex flex-col gap-3">
      <fieldset className="flex flex-wrap gap-3 text-sm">
        <legend className="mb-1 text-[14px] font-semibold text-color-text-secondary">Zulässige Rechtsgrundlagen für den Versand</legend>
        {Object.entries(BASIS_LABEL).map(([k, label]) => (
          <label key={k} className="flex items-center gap-1">
            <input type="checkbox" checked={bases.includes(k)} onChange={(e) => setBases((x) => (e.target.checked ? [...x, k] : x.filter((b) => b !== k)))} />
            {label}
          </label>
        ))}
        {basesChanged && (
          <Button text="Rechtsgrundlagen speichern" variant="secondary" size="small" isDisabled={bases.length === 0 || !canWrite}
            onClick={() => run(() => saveTemplate.mutateAsync({ id: template.id, name: template.name, purpose: template.purpose, allowedBases: bases }),
              ["Rechtsgrundlagen gespeichert", "Gilt für alle künftigen Versände mit dieser Vorlage."], "Rechtsgrundlagen nicht gespeichert")} />
        )}
        {bases.length === 0 && <span className="text-xs text-color-error-text">Mindestens eine Rechtsgrundlage wählen.</span>}
      </fieldset>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-3">
          <InputField label="Betreff" placeholder="Alles Gute, {{rufname}}!" value={subject} onChange={(v) => setSubject(v.replace(/[\r\n]+/g, " "))} isReadOnly={!editable} />
          <TextArea label="Text (Leerzeile = neuer Absatz)" value={body} onChange={setBody} rows={10} isReadOnly={!editable} />
          <p className="text-xs text-color-text-subtle">
            Platzhalter: {MERGE_FIELDS.map((f) => <code key={f} title={MERGE_FIELD_LABEL[f]} className="mr-1">{`{{${f}}}`}</code>)}
          </p>
          {lengthProblem && <p className="text-xs text-color-error-text">{lengthProblem}</p>}
          {problem && <p className="text-xs text-color-error-text">{problem.kind === "invalid_template" ? "Ein Platzhalter ist nicht korrekt geschlossen." : `Unbekannter Platzhalter: ${problem.field}`}</p>}
          <div className="flex flex-wrap gap-3">
            {editable && <Button text="Entwurf speichern" variant="secondary" isDisabled={Boolean(problem) || Boolean(lengthProblem) || subject.trim().length < 3 || body.trim().length < 10 || !canWrite}
              onClick={() => run(() => saveDraft.mutateAsync({ templateId: template.id, subject, body }), ["Entwurf gespeichert", "Reichen Sie ihn zur Freigabe ein, wenn er fertig ist."], "Entwurf nicht gespeichert")} />}
            {open?.status === "draft" && <Button text="Zur Freigabe einreichen" isDisabled={!canWrite} onClick={() => run(() => submit.mutateAsync(open.id), ["Zur Freigabe eingereicht", "Eine zweite Person muss die Version freigeben."], "Nicht eingereicht")} />}
            {open?.status === "submitted" && open.created_by !== user?.id && (
              <>
                <Button text="Freigeben" variant="approve" isDisabled={!canWrite} onClick={() => run(() => decide.mutateAsync({ id: open.id, approve: true }), ["Vorlage freigegeben", "Neue Kampagnen verwenden ab jetzt diese Version."], "Vorlage nicht freigegeben")} />
                <Button text="Ablehnen" variant="decline" isDisabled={!canWrite} onClick={() => openModal({
                  title: "Vorlage ablehnen",
                  children: <ReasonConfirmForm message="Die Begründung sieht die Autorin/der Autor." variant="decline" onCancel={closeModal}
                    onConfirm={async (note) => { await decide.mutateAsync({ id: open.id, approve: false, note }); closeModal(); showBanner("Vorlage abgelehnt", "Die Autorin bzw. der Autor sieht Ihre Begründung.", "success"); }} />,
                })} />
              </>
            )}
            {active && <TestSendButton versionId={active.id} />}
            {open?.status === "submitted" && open.created_by === user?.id && <p className="text-xs text-color-text-subtle">Freigabe durch eine zweite Person (Vier-Augen-Prinzip).</p>}
          </div>
        </div>
        <div className="flex flex-col gap-2 rounded-radius-md border border-color-border-light p-3">
          <p className="text-xs text-color-text-subtle">Vorschau mit Beispieldaten</p>
          <p className="text-sm font-semibold">{preview.subject}</p>
          {/* Rendered from escaped text only (escapeHtml), never from authored HTML. */}
          <div className="text-sm" dangerouslySetInnerHTML={{ __html: preview.html }} />
        </div>
      </div>
      <ol className="flex flex-col gap-1 text-xs text-color-text-secondary">
        {versions.map((v) => (
          <li key={v.id}>
            v{v.version} · <StatusBadge status={v.status} map={VERSION_STATUS} /> · {formatDateTime(v.decided_at ?? v.submitted_at ?? v.created_at)}
            {v.decision_note && ` – ${v.decision_note}`}
          </li>
        ))}
      </ol>
    </div>
  );
};
