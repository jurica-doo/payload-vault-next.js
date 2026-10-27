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
      <label htmlFor={id} className="mb-1.5 flex items-center gap-0.5 text-[0.8125rem] font-medium text-color-text-secondary">
        <span>{label}</span>
        {isRequired && (
          <span aria-hidden className="text-color-error-text">
            *
          </span>
        )}
      </label>
      {children(id, describedBy)}
      {hint && !error && (
        <p id={hintId} className="mt-1.5 text-xs text-color-text-subtle">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="mt-1.5 text-[0.8125rem] text-color-error-text animate-slide-down">
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

// Moved to utils so domain code can use it without importing a component.
export { parseGermanDecimal } from "../../utils/format";

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
