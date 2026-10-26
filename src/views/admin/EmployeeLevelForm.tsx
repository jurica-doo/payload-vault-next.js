"use client";

import { useState } from "react";
import { Button } from "../../components/button/Button";
import { DateInput, TextArea } from "../../components/formFields/FormFields";
import { MIN_REASON_LENGTH } from "../../components/reasonConfirm/ReasonConfirmForm";
import { LEVEL_CODES } from "../../domain/rules";

const LEVEL_NAMES: Record<string, string> = {
  FA: "Finanzassistent", FB: "Fachberater", TL: "Teamleiter", OL: "Organisationsleiter",
  DL: "Direktionsleiter", RL: "Regionalleiter", VD: "Vertriebsdirektor",
};

/**
 * Initial level for a new employee, or an explicit admin correction.
 * Promotions don't go through here; they come from the career engine's
 * qualification queue with their evidence.
 */
export const EmployeeLevelForm = ({
  currentLevel,
  startDate,
  onSubmit,
  onCancel,
}: {
  currentLevel: string | null;
  startDate: string;
  onSubmit: (levelCode: string, effectiveFrom: string, reason: string) => Promise<void>;
  onCancel: () => void;
}) => {
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date());
  const [level, setLevel] = useState(currentLevel ?? "FA");
  const [from, setFrom] = useState(currentLevel ? today : startDate);
  const [reason, setReason] = useState(currentLevel ? "" : "Einstiegsstufe bei Eintritt");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (reason.trim().length < MIN_REASON_LENGTH) return setError(`Bitte mindestens ${MIN_REASON_LENGTH} Zeichen Begründung.`);
    setBusy(true);
    try {
      await onSubmit(level, from, reason.trim());
    } catch (e) {
      setError(e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="flex flex-col gap-4 pt-2" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
      <p className="text-sm">
        {currentLevel
          ? `Aktuelle Stufe: ${currentLevel}. Eine Änderung hier ist eine Korrektur und wird mit Begründung protokolliert. Beförderungen laufen über die Karriereprüfung.`
          : "Noch keine Stufe hinterlegt. Die Einstiegsstufe gilt ab dem Startdatum."}
      </p>
      <label className="flex flex-col gap-1 text-[14px] font-semibold text-color-text-secondary">
        Stufe
        <select
          className="rounded-lg border border-color-border-light bg-color-bg-dark px-3 py-3 font-medium text-color-text-main"
          value={level}
          onChange={(e) => setLevel(e.target.value)}
        >
          {LEVEL_CODES.map((c) => (
            <option key={c} value={c}>{c} – {LEVEL_NAMES[c]}</option>
          ))}
        </select>
      </label>
      <DateInput label="Gültig ab" value={from} min={startDate} onChange={setFrom} />
      <TextArea label="Begründung" value={reason} onChange={setReason} maxLength={500} isRequired error={error} />
      <div className="flex flex-wrap gap-3 sm:gap-6">
        <Button variant="secondary" text="Abbrechen" onClick={onCancel} isDisabled={busy} />
        <Button type="submit" text="Speichern" isLoading={busy} />
      </div>
    </form>
  );
};
