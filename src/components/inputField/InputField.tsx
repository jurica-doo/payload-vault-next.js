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
}: InputFieldProps) => {
  const inputId = useId();

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    onChange?.(e.target.value);
  };

  return (
    <div className="relative flex w-full flex-col">
      <label
        htmlFor={inputId}
        className="mb-1 flex h-6 items-center font-semibold text-color-text-secondary"
      >
        {isRequired && <span className="text-[24px] leading-none">*</span>}
        <span className="ml-1 text-[14px] text-color-text-secondary">
          {label}
        </span>
      </label>

      <input
        id={inputId}
        readOnly={isReadOnly}
        placeholder={placeholder}
        type={type}
        value={value ?? undefined}
        onChange={handleChange}
        className={getInputStyles(position, type, Boolean(error), isReadOnly)}
      />

      {error && (
        <p className="mt-1 text-[16px] font-medium text-color-error-text">
          {error}
        </p>
      )}
    </div>
  );
};
