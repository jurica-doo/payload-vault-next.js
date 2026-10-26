"use client";

import { useId, type ReactNode } from "react";
import { getInputStyles } from "../inputField/InputField.const";

/**
 * Field types InputField doesn't cover (text/email/number only). Same label,
 * error and input styling as InputField so forms look uniform.
 */

type FieldShellProps = {
  label: string;
  isRequired?: boolean;
  error?: string;
  hint?: string;
  children: (id: string, describedBy: string | undefined) => ReactNode;
};

const FieldShell = ({ label, isRequired, error, hint, children }: FieldShellProps) => {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint && hintId, error && errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className="relative flex w-full flex-col">
      <label htmlFor={id} className="mb-1 flex h-6 items-center font-semibold text-color-text-secondary">
        {isRequired && <span className="text-[24px] leading-none">*</span>}
        <span className="ml-1 text-[14px] text-color-text-secondary">{label}</span>
      </label>
      {children(id, describedBy)}
      {hint && !error && (
        <p id={hintId} className="mt-1 text-xs text-color-text-subtle">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="mt-1 text-[16px] font-medium text-color-error-text">
          {error}
        </p>
      )}
    </div>
  );
};

type BaseProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  isRequired?: boolean;
  isReadOnly?: boolean;
  error?: string;
  hint?: string;
  name?: string;
};

export const TextArea = ({
  label,
  value,
  onChange,
  placeholder = "",
  rows = 4,
  maxLength,
  isRequired,
  isReadOnly = false,
  error,
  hint,
  name,
}: BaseProps & { placeholder?: string; rows?: number; maxLength?: number }) => (
  <FieldShell label={label} isRequired={isRequired} error={error} hint={hint}>
    {(id, describedBy) => (
      <textarea
        id={id}
        name={name}
        rows={rows}
        maxLength={maxLength}
        placeholder={placeholder}
        readOnly={isReadOnly}
        required={isRequired}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`${getInputStyles("full", "text", Boolean(error), isReadOnly)} resize-y`}
      />
    )}
  </FieldShell>
);

/** Calendar date as "YYYY-MM-DD" (business dates are dates, not instants). */
export const DateInput = ({
  label,
  value,
  onChange,
  min,
  max,
  isRequired,
  isReadOnly = false,
  error,
  hint,
  name,
}: BaseProps & { min?: string; max?: string }) => (
  <FieldShell label={label} isRequired={isRequired} error={error} hint={hint}>
    {(id, describedBy) => (
      <input
        id={id}
        type="date"
        name={name}
        min={min}
        max={max}
        readOnly={isReadOnly}
        required={isRequired}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={getInputStyles("full", "text", Boolean(error), isReadOnly)}
      />
    )}
  </FieldShell>
);

/**
 * Normalises German number input to a plain decimal string for the API:
 * "1.234,56" → "1234.56", "10,5" → "10.5". Returns null when the text is not
 * a number, so forms can show an error instead of silently sending 0.
 */
export function parseGermanDecimal(text: string): string | null {
  const trimmed = text.trim().replace(/\s/g, "");
  if (trimmed === "") return null;
  // Thousands separators are dots, decimal separator is a comma. A dot with
  // exactly three digits after it and no comma is treated as grouping.
  const normalized = trimmed.includes(",")
    ? trimmed.replace(/\./g, "").replace(",", ".")
    : /^-?\d{1,3}(\.\d{3})+$/.test(trimmed)
      ? trimmed.replace(/\./g, "")
      : trimmed;
  return /^-?\d+(\.\d+)?$/.test(normalized) ? normalized : null;
}

/**
 * Decimal input that keeps the user's text and reports the parsed value.
 * `inputMode="decimal"` brings up the right keyboard on phones; we don't use
 * type="number" because browsers reject the German comma there.
 */
export const DecimalInput = ({
  label,
  value,
  onChange,
  suffix,
  placeholder = "",
  isRequired,
  isReadOnly = false,
  error,
  hint,
  name,
}: BaseProps & { suffix?: string; placeholder?: string }) => (
  <FieldShell label={label} isRequired={isRequired} error={error} hint={hint}>
    {(id, describedBy) => (
      <div className="relative flex">
        <input
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          name={name}
          placeholder={placeholder}
          readOnly={isReadOnly}
          required={isRequired}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`${getInputStyles("full", "text", Boolean(error), isReadOnly)} w-full ${suffix ? "pr-12 sm:pr-12" : ""} text-right tabular-nums`}
        />
        {suffix && (
          <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-color-text-subtle">
            {suffix}
          </span>
        )}
      </div>
    )}
  </FieldShell>
);

export const CurrencyInput = (props: Omit<Parameters<typeof DecimalInput>[0], "suffix">) => (
  <DecimalInput {...props} suffix="€" />
);
