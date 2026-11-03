"use client";

import { Select } from "../../components/select/Select";
import { ModalActions } from "../../components/modal/ModalActions";
import { LoadingState } from "../../components/loadingState/LoadingState";
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
import { dbErrorMessage, errorText } from "../../utils/dbErrors";
import { parseGermanDecimal } from "../../utils/format";
import type { ProductionInput } from "../../hooks/useProduction/useProduction";
import { Form } from "../../components/form/Form";

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
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };


  return (
    <Form className="flex flex-col gap-4 pt-2" onSubmit={(e) => { e.preventDefault(); void submit(false); }}>
      {producerId === null && (
        <EmployeePicker label="Person" employees={employees} value={producer} onChange={setProducer} isRequired />
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <Select
          label="Sparte"
          value={category}
          onChange={chooseCategory}
          options={(rules?.conversion?.rows ?? []).map((r) => ({
            value: r.categoryCode,
            label: `${r.nameDe}${r.formulaKind === "none" ? " (keine Punkte)" : ""}`,
          }))}
          fullWidth
        />
        <DateInput label="Produktionsdatum" value={date} max={berlinToday()} onChange={setDate} isRequired />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <CurrencyInput label="Beitrag" value={premium} onChange={setPremium} placeholder="100,00" isRequired />
        <Select
          label="Rhythmus"
          value={period}
          isDisabled={!!rule?.requiredPremiumPeriod}
          onChange={(v) => setPeriod(v as ProductionInput["premiumPeriod"])}
          options={Object.entries(PERIOD_LABELS).map(([value, label]) => ({ value, label }))}
          fullWidth
        />
        {rule?.formulaKind === "lv_monthly_term" && (
          <DecimalInput label="Laufzeit" suffix="Jahre" value={term} onChange={setTerm} isRequired />
        )}
        {rule?.requiredNetGross && (
          <Select
            label="Netto/Brutto"
            value={netOrGross ?? ""}
            onChange={(v) => setNetOrGross((v || null) as "net" | "gross" | null)}
            options={[{ value: "net", label: "Netto (Jahresnettobeitrag)" }, { value: "gross", label: "Brutto" }]}
            fullWidth
          />
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <InputField label="Vertrags-/Antragsnummer" placeholder="optional" value={reference} onChange={setReference} />
        <TextArea label="Notiz" value={notes} onChange={setNotes} rows={2} maxLength={1000} />
      </div>

      <section aria-live="polite" className="rounded-radius-md bg-color-bg-dark p-3 text-sm">
        {rulesLoading ? (
          <LoadingState label="Regeln werden geladen…" />
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

      <ModalActions>
        <Button variant="secondary" text="Abbrechen" onClick={onCancel} isDisabled={busy} />
        <Button type="submit" variant="secondary" text="Als Entwurf speichern" isLoading={busy} />
        <Button text="Speichern & einreichen" onClick={() => submit(true)} isLoading={busy} />
      </ModalActions>
    </Form>
  );
};
