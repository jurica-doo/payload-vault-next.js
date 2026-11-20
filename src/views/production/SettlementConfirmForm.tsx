"use client";

import { useState } from "react";
import { Button } from "../../components/button/Button";
import { DateInput } from "../../components/formFields/FormFields";
import { Form } from "../../components/form/Form";
import { ModalActions } from "../../components/modal/ModalActions";
import { errorText } from "../../utils/dbErrors";
import { formatDate } from "../../utils/format";

const berlinToday = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date());

/**
 * Finance confirms that the product company has settled a contract
 * („Abrechnung bestätigen“). The policy date decides the level, rates and
 * structure for commission (Profina, 2026-11); own contracts earn no
 * commission but still count for the career.
 */
export const SettlementConfirmForm = ({
  productionDate,
  onSubmit,
  onCancel,
}: {
  productionDate: string;
  onSubmit: (policyDate: string, ownContract: boolean) => Promise<void>;
  onCancel: () => void;
}) => {
  const today = berlinToday();
  const [policyDate, setPolicyDate] = useState(productionDate <= today ? productionDate : today);
  const [ownContract, setOwnContract] = useState(false);
  const [error, setError] = useState<string>();

  const submit = async () => {
    if (!policyDate) return setError("Bitte das Policierungsdatum angeben.");
    if (policyDate < productionDate) return setError("Das Policierungsdatum darf nicht vor dem Produktionsdatum liegen.");
    if (policyDate > today) return setError("Das Policierungsdatum darf nicht in der Zukunft liegen.");
    setError(undefined);
    try {
      await onSubmit(policyDate, ownContract);
    } catch (e) {
      setError(errorText(e));
    }
  };

  return (
    <Form className="flex flex-col gap-4 pt-2" onSubmit={(e) => { e.preventDefault(); return submit(); }}>
      <p className="text-sm">
        Die Produktgesellschaft hat den Vertrag abgerechnet. Mit der Bestätigung werden Punkte und Provision gebucht.
      </p>
      <DateInput
        label="Policierungsdatum"
        value={policyDate}
        min={productionDate}
        max={today}
        onChange={setPolicyDate}
        isRequired
        error={error}
        hint={`Bestimmt Karrierestufe und Provisionssatz. Produktionsdatum: ${formatDate(productionDate)}.`}
      />
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-0.5" checked={ownContract} onChange={(e) => setOwnContract(e.target.checked)} />
        <span>
          Eigenvertrag: Der Vermittler ist selbst Versicherungsnehmer oder versicherte Person.
          <span className="block text-xs text-color-text-subtle">Es wird keine Provision gezahlt; die Punkte zählen für die Karriere.</span>
        </span>
      </label>
      <ModalActions>
        <Button variant="secondary" text="Abbrechen" onClick={onCancel} />
        <Button type="submit" text="Abrechnung bestätigen" />
      </ModalActions>
    </Form>
  );
};
