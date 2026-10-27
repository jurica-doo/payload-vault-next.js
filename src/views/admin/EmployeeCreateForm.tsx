"use client";

import { errorText } from "../../utils/dbErrors";
import { ModalActions } from "../../components/modal/ModalActions";
import { useState } from "react";
import { Button } from "../../components/button/Button";
import { InputField } from "../../components/inputField/InputField";
import { DateInput } from "../../components/formFields/FormFields";
import { employeeSchema, type EmployeeFormInput } from "../../validation/EmployeeValidation";
import type { NewEmployee } from "../../hooks/useEmployees/useEmployees";

type Errors = Partial<Record<keyof EmployeeFormInput | "form", string>>;

const EMPTY: EmployeeFormInput = {
  firstName: "",
  lastName: "",
  email: "",
  startDate: "",
  employmentType: "full_time",
  phone: "",
};

/**
 * New employee. If the email already has an account (existing vault user),
 * the database links it and no invite is sent; otherwise the invite email
 * goes out right after creation.
 */
export const EmployeeCreateForm = ({
  onSubmit,
  onCancel,
}: {
  onSubmit: (input: NewEmployee) => Promise<void>;
  onCancel: () => void;
}) => {
  const [values, setValues] = useState<EmployeeFormInput>(EMPTY);
  const [errors, setErrors] = useState<Errors>({});
  const [isLoading, setIsLoading] = useState(false);

  const set = (key: keyof EmployeeFormInput) => (value: string) => {
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined, form: undefined }));
  };

  const submit = async () => {
    const parsed = employeeSchema.safeParse(values);
    if (!parsed.success) {
      const next: Errors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof EmployeeFormInput;
        next[key] ??= issue.message;
      }
      setErrors(next);
      return;
    }
    setIsLoading(true);
    try {
      await onSubmit(parsed.data);
    } catch (e) {
      setErrors({ form: errorText(e) });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form
      className="flex flex-col gap-4 pt-2"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <InputField label="Vorname" placeholder="Nora" value={values.firstName} onChange={set("firstName")} error={errors.firstName} isRequired autoComplete="off" />
        <InputField label="Nachname" placeholder="Neumann" value={values.lastName} onChange={set("lastName")} error={errors.lastName} isRequired autoComplete="off" />
      </div>
      <InputField label="E-Mail" type="email" placeholder="nora.neumann@pro-fina.de" value={values.email} onChange={set("email")} error={errors.email} isRequired autoComplete="off" />
      <div className="grid gap-3 sm:grid-cols-2">
        <DateInput label="Startdatum" value={values.startDate} onChange={set("startDate")} error={errors.startDate} isRequired hint="Beginn des ersten Karrierejahres" />
        <InputField label="Telefon" placeholder="0170 1234567" value={values.phone} onChange={set("phone")} error={errors.phone} autoComplete="off" />
      </div>
      <label className="flex flex-col gap-1 text-[14px] font-semibold text-color-text-secondary">
        Beschäftigung
        <select
          className="ui-input"
          value={values.employmentType}
          onChange={(e) => set("employmentType")(e.target.value)}
        >
          <option value="full_time">Vollzeit</option>
          <option value="part_time">Teilzeit</option>
        </select>
      </label>

      {errors.form && (
        <p role="alert" className="text-sm font-medium text-color-error-text">
          {errors.form}
        </p>
      )}

      <ModalActions>
        <Button variant="secondary" text="Abbrechen" onClick={onCancel} isDisabled={isLoading} />
        <Button type="submit" text="Anlegen & einladen" isLoading={isLoading} />
      </ModalActions>
    </form>
  );
};
