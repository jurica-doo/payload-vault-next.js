import { useId, type ChangeEvent } from "react";
import { type InputFieldProps } from "./InputField.types";
import { getInputStyles } from "./InputField.const";

export const InputField = ({
  label,
  placeholder,
  position = "full",
  type = "text",
  isReadOnly = false,
  error,
  value,
  onChange,
  isRequired = false,
  name,
  autoComplete,
}: InputFieldProps) => {
  const inputId = useId();

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    onChange?.(e.target.value);
  };

  return (
    <div className="relative flex w-full flex-col">
      <label
        htmlFor={inputId}
        className="mb-1.5 flex items-center gap-0.5 text-[0.8125rem] font-medium text-color-text-secondary"
      >
        <span>{label}</span>
        {isRequired && (
          <span aria-hidden className="text-color-error-text">
            *
          </span>
        )}
      </label>

      <input
        id={inputId}
        readOnly={isReadOnly}
        placeholder={placeholder}
        type={type}
        name={name}
        autoComplete={autoComplete}
        value={value ?? undefined}
        onChange={handleChange}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={error ? `${inputId}-error` : undefined}
        required={isRequired}
        className={getInputStyles(position, type, Boolean(error), isReadOnly)}
      />

      {error && (
        <p
          id={`${inputId}-error`}
          className="mt-1.5 text-[0.8125rem] text-color-error-text animate-slide-down"
        >
          {error}
        </p>
      )}
    </div>
  );
};
