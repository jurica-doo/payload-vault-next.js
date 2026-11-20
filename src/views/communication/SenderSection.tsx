"use client";

import { useState } from "react";
import { Button } from "../../components/button/Button";
import { Form } from "../../components/form/Form";
import { InputField } from "../../components/inputField/InputField";
import { LoadingState } from "../../components/loadingState/LoadingState";
import { ReasonConfirmForm } from "../../components/reasonConfirm/ReasonConfirmForm";
import { StatusBadge } from "../../components/statusBadge/StatusBadge";
import { useBanner } from "../../context/banner/BannerContext";
import { useModal } from "../../context/modal/ModalContext";
import type { EmailSender } from "../../domain/emailTemplate";
import { usePermissions } from "../../hooks/permissions/usePermissions";
import { useEmailSender } from "../../hooks/useEmail/useEmail";
import { errorText } from "../../utils/dbErrors";
import { card } from "./emailLabels";

type Field = Exclude<keyof EmailSender, "complete">;
const FIELDS: { key: Field; label: string; placeholder: string }[] = [
  { key: "company", label: "Firma (mit Rechtsform)", placeholder: "Profina Deutschland GmbH" },
  { key: "address", label: "Anschrift", placeholder: "Castroper Straße 270–280, 44791 Bochum" },
  { key: "register", label: "Registergericht und -nummer", placeholder: "Amtsgericht Bochum, HRB 12345" },
  { key: "management", label: "Geschäftsführung", placeholder: "Vor- und Nachname(n)" },
  { key: "contact_email", label: "Kontakt-E-Mail", placeholder: "kontakt@pro-fina.de" },
  { key: "app_url", label: "Adresse der App (für den Abmeldelink)", placeholder: "https://app.pro-fina.de" },
];

/**
 * Mandatory details of the sender (business e-mail of a GmbH) shown in the
 * footer of every client mail, next to the adviser's signature and the
 * unsubscribe link. Sending can only be switched on once they are complete.
 */
export const SenderSection = () => {
  const { permissions } = usePermissions();
  const { sender, save } = useEmailSender(true);
  const { openModal, closeModal } = useModal();
  const { showBanner } = useBanner();
  const [edit, setEdit] = useState<Partial<Record<Field, string>> | null>(null);

  if (sender.error) return <section className={card}><p role="alert" className="text-sm text-color-error-text">{errorText(sender.error)}</p></section>;
  if (!sender.data) return <section className={card}><LoadingState /></section>;
  const saved = sender.data;
  const form = edit ?? Object.fromEntries(FIELDS.map((f) => [f.key, saved[f.key] ?? ""]));
  const canWrite = permissions.isAdmin && permissions.hasMfa;
  const changed = FIELDS.some((f) => (form[f.key] ?? "") !== (saved[f.key] ?? ""));

  const submit = () =>
    openModal({
      title: "Absenderangaben speichern",
      children: (
        <ReasonConfirmForm
          message="Die Angaben stehen ab sofort im Fuß jeder E-Mail an Kundinnen und Kunden."
          onCancel={closeModal}
          onConfirm={async (reason) => {
            await save.mutateAsync({ value: form, reason });
            closeModal();
            setEdit(null);
            showBanner("Absenderangaben gespeichert", "Sie erscheinen im Fuß jeder Kunden-E-Mail.", "success");
          }}
        />
      ),
    });

  return (
    <section className={card}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold">Absender & Pflichtangaben</h2>
        <StatusBadge
          status={saved.complete ? "ok" : "missing"}
          map={{ ok: { label: "vollständig", tone: "success" }, missing: { label: "unvollständig – Versand gesperrt", tone: "warning" } }}
        />
      </div>
      <p className="text-sm text-color-text-secondary">
        Jede E-Mail an Kundinnen und Kunden endet automatisch mit der Signatur der betreuenden Person, diesen Angaben und einem
        Abmeldelink. Ohne vollständige Angaben lässt sich der Versand nicht einschalten.
      </p>
      <Form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <div className="grid gap-3 sm:grid-cols-2">
          {FIELDS.map((f) => (
            <InputField
              key={f.key}
              label={f.label}
              placeholder={f.placeholder}
              value={form[f.key] ?? ""}
              onChange={(v) => setEdit({ ...form, [f.key]: v })}
              isReadOnly={!canWrite}
            />
          ))}
        </div>
        {canWrite && (
          <div className="flex flex-wrap gap-2">
            <Button type="submit" text="Angaben speichern" isDisabled={!changed} />
            {edit && <Button variant="ghost" text="Verwerfen" onClick={() => setEdit(null)} />}
          </div>
        )}
      </Form>
    </section>
  );
};
