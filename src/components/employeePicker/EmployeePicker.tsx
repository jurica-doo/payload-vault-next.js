"use client";

import { Dropdown } from "../dropdown/Dropdown";
import type { Option } from "../dropdown/Dropdown.types";

export type PickableEmployee = {
  id: string;
  first_name: string;
  last_name: string;
  employee_no: string;
  status?: string;
};

export const NO_EMPLOYEE_ID = "__none__";

/**
 * Searchable employee selection built on the existing Dropdown. The list is
 * whatever the caller passes in, usually RLS-filtered rows, so a leader can
 * only pick people in their own structure. Inactive employees are marked.
 */
export const EmployeePicker = ({
  employees,
  value,
  onChange,
  label,
  placeholder = "Mitarbeitende suchen",
  noneLabel,
  excludeIds = [],
  error,
  isRequired,
}: {
  employees: PickableEmployee[];
  /** undefined = nothing chosen yet; null = the explicit "none" option. */
  value: string | null | undefined;
  onChange: (id: string | null) => void;
  label?: string;
  placeholder?: string;
  /** Adds an explicit "nobody" option (e.g. "Keine Führungskraft"). */
  noneLabel?: string;
  excludeIds?: string[];
  error?: string;
  isRequired?: boolean;
}) => {
  const options: Option[] = [
    ...(noneLabel ? [{ id: NO_EMPLOYEE_ID, label: noneLabel }] : []),
    ...employees
      .filter((e) => !excludeIds.includes(e.id))
      .sort((a, b) => `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`, "de-DE"))
      .map((e) => ({
        id: e.id,
        label: `${e.last_name}, ${e.first_name} (${e.employee_no})${e.status === "inactive" ? " – inaktiv" : ""}`,
      })),
  ];
  const selected =
    value === undefined
      ? null
      : value === null
        ? (options.find((o) => o.id === NO_EMPLOYEE_ID) ?? null)
        : (options.find((o) => o.id === value) ?? null);

  return (
    <Dropdown
      options={options}
      value={selected}
      onSelect={(o) => onChange(o.id === NO_EMPLOYEE_ID ? null : o.id)}
      label={label}
      placeholder={placeholder}
      isSearchEnabled
      isRequired={isRequired}
      error={error}
    />
  );
};
