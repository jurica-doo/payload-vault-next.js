"use client";

import { useState } from "react";
import { Button } from "../../components/button/Button";
import { InputField } from "../../components/inputField/InputField";
import { CurrencyInput, DateInput, DecimalInput, TextArea } from "../../components/formFields/FormFields";
import { EmployeePicker, type PickableEmployee } from "../../components/employeePicker/EmployeePicker";
import { CalculationBreakdown } from "../../components/calculationBreakdown/CalculationBreakdown";
import { ProvisionalRuleNotice } from "../../components/provisionalRuleNotice/ProvisionalRuleNotice";
import { AeValue, MoneyValue, PointsValue } from "../../components/values/Values";
import { useRules } from "../../hooks/useRules/useRules";
import { calculatePoints } from "../../domain/points";
import { dbErrorMessage } from "../../utils/dbErrors";
import { parseGermanDecimal } from "../../utils/format";
import type { ProductionInput } from "../../hooks/useProduction/useProduction";

const PERIOD_LABELS = { monthly: "monatlich", annual: "jährlich", one_off: "einmalig" } as const;
const berlinToday = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date());

/**
 * Production entry with a live points preview (TS mirror of the DB engine,
 * rules for the chosen production date). The database recalculates and is
 * the authority; the preview only helps catch mistakes while typing.
 */
export const ProductionForm = ({
  producerId,
  employees,
  onSubmit,
  onCancel,
}: {
  /** Fixed producer (own entry); omit to let an admin pick. */
  producerId: string | null;
  employees: PickableEmployee[];
  onSubmit: (input: ProductionInput, submitNow: boolean) => Promise<void>;
  onCancel: () => void;
}) => {
  const [producer, setProducer] = useState<string | null | undefined>(producerId ?? undefined);
  const [category, setCategory] = useState("LV");
  const [premium, setPremium] = useState("");
  const [period, setPeriod] = useState<ProductionInput["premiumPeriod"]>("monthly");
  const [netOrGross, setNetOrGross] = useState<"net" | "gross" | null>(null);
  const [term, setTerm] = useState("");
  const [date, setDate] = useState(berlinToday());
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const { data: rules, isLoading: rulesLoading } = useRules(date || undefined);
  const rule = rules?.conversion?.rows.find((r) => r.categoryCode === category);
  const premiumValue = parseGermanDecimal(premium);
  const termValue = term.trim() === "" ? null : parseGermanDecimal(term);

  const preview =
    rules && premium.trim() !== ""
      ? calculatePoints(rules, {
          category,
          premium: premiumValue ?? "invalid",
          period,
          netOrGross,
          termYears: termValue,
          productionDate: date,
        })
      : null;

  const chooseCategory = (code: string) => {
    setCategory(code);
    const r = rules?.conversion?.rows.find((x) => x.categoryCode === code);
    if (r?.requiredPremiumPeriod) setPeriod(r.requiredPremiumPeriod);
    setNetOrGross(r?.requiredNetGross ? "net" : null);
  };

  const submit = async (submitNow: boolean) => {
    if (!producer) return setError("Bitte die Person wählen.");
    if (premiumValue === null) return setError("Bitte den Beitrag als Zahl angeben, z. B. 100,00.");
    if (preview && !preview.ok) return setError(dbErrorMessage({ message: preview.error }));
    setError(undefined);
    setBusy(true);
    try {
      await onSubmit(
        {
          id: null,
          producerId: producer,
          categoryCode: category,
          premiumAmount: premiumValue,
          premiumPeriod: period,
          netOrGross,
          termYears: rule?.formulaKind === "lv_monthly_term" ? termValue : null,
          productionDate: date,
          productReference: reference.trim(),
          notes: notes.trim(),
        },
        submitNow,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  const select = "rounded-lg border border-color-border-light bg-color-bg-dark px-3 py-3 font-medium text-color-text-main";

  return (
    <form className="flex flex-col gap-4 pt-2" onSubmit={(e) => { e.preventDefault(); void submit(false); }}>
      {producerId === null && (
        <EmployeePicker label="Person" employees={employees} value={producer} onChange={setProducer} isRequired />
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-[14px] font-semibold text-color-text-secondary">
          Sparte
          <select className={select} value={category} onChange={(e) => chooseCategory(e.target.value)}>
            {(rules?.conversion?.rows ?? []).map((r) => (
              <option key={r.categoryCode} value={r.categoryCode}>
                {r.nameDe}{r.formulaKind === "none" ? " (keine Punkte)" : ""}
              </option>
            ))}
          </select>
        </label>
        <DateInput label="Produktionsdatum" value={date} max={berlinToday()} onChange={setDate} isRequired />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <CurrencyInput label="Beitrag" value={premium} onChange={setPremium} placeholder="100,00" isRequired />
        <label className="flex flex-col gap-1 text-[14px] font-semibold text-color-text-secondary">
          Rhythmus
          <select
            className={select}
            value={period}
            disabled={!!rule?.requiredPremiumPeriod}
            onChange={(e) => setPeriod(e.target.value as ProductionInput["premiumPeriod"])}
          >
            {Object.entries(PERIOD_LABELS).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </label>
        {rule?.formulaKind === "lv_monthly_term" && (
          <DecimalInput label="Laufzeit" suffix="Jahre" value={term} onChange={setTerm} isRequired />
        )}
        {rule?.requiredNetGross && (
          <label className="flex flex-col gap-1 text-[14px] font-semibold text-color-text-secondary">
            Netto/Brutto
            <select className={select} value={netOrGross ?? ""} onChange={(e) => setNetOrGross((e.target.value || null) as "net" | "gross" | null)}>
              <option value="net">Netto (Jahresnettobeitrag)</option>
              <option value="gross">Brutto</option>
            </select>
          </label>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <InputField label="Vertrags-/Antragsnummer" placeholder="optional" value={reference} onChange={setReference} />
        <TextArea label="Notiz" value={notes} onChange={setNotes} rows={2} maxLength={1000} />
      </div>

      <section aria-live="polite" className="rounded-radius-md bg-color-bg-dark p-3 text-sm">
        {rulesLoading ? (
          <p>Regeln werden geladen…</p>
        ) : !preview ? (
          <p className="text-color-text-subtle">Vorschau erscheint nach Eingabe des Beitrags.</p>
        ) : !preview.ok ? (
          <p className="text-color-error-text">{dbErrorMessage({ message: preview.error })}</p>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="flex flex-wrap gap-x-4 gap-y-1">
              <span>Vorschau:</span>
              <PointsValue value={preview.points} />
              <AeValue value={preview.ae} />
              {preview.kvPoints.gt(0) && <PointsValue value={preview.kvPoints} isKv />}
            </p>
            {preview.termCapped && (
              <ProvisionalRuleNotice decisionId="OD-06" text="Laufzeit über 35 Jahre wird in der Formel mit 35 Jahren gerechnet." />
            )}
            <details>
              <summary className="cursor-pointer text-xs text-color-text-subtle">Berechnung anzeigen</summary>
              <CalculationBreakdown
                inputs={[
                  { label: "Beitrag", value: <MoneyValue value={premiumValue} /> },
                  { label: "Rhythmus", value: PERIOD_LABELS[period] },
                  ...(preview.termUsed ? [{ label: "Laufzeit (gerechnet)", value: `${preview.termUsed} Jahre` }] : []),
                ]}
                formula={preview.formula}
                result={{ label: "Punkte", value: <PointsValue value={preview.points} /> }}
                ruleVersion={rules?.conversion?.label}
              />
            </details>
          </div>
        )}
      </section>

      {error && <p role="alert" className="text-sm font-medium text-color-error-text">{error}</p>}

      <div className="flex flex-wrap gap-3">
        <Button variant="secondary" text="Abbrechen" onClick={onCancel} isDisabled={busy} />
        <Button type="submit" variant="secondary" text="Als Entwurf speichern" isLoading={busy} />
        <Button text="Speichern & einreichen" onClick={() => submit(true)} isLoading={busy} />
      </div>
    </form>
  );
};
