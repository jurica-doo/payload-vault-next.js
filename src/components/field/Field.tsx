import type { ReactNode } from "react";

type FieldProps = {
  label: ReactNode;
  children: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  className?: string;
};

/**
 * Label above, control, then hint or error below. Wraps any input/select so
 * every form on every page lines up the same way.
 */
export const Field = ({
  label,
  children,
  hint,
  error,
  required,
  className = "",
}: FieldProps) => (
  <label className={`ui-label ${className}`}>
    <span>
      {label}
      {required && (
        <span aria-hidden className="ml-0.5 text-color-error-text">
          *
        </span>
      )}
    </span>
    {children}
    {error ? (
      <span role="alert" className="text-xs font-normal text-color-error-text">
        {error}
      </span>
    ) : hint ? (
      <span className="text-xs font-normal text-color-text-subtle">{hint}</span>
    ) : null}
  </label>
);
