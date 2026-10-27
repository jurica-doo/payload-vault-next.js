import { useId, useState, type ChangeEvent } from "react";
import { EyeIcon } from "../icons";
import { type PasswordInputProps } from "./PasswordInput.types";
import { CloseEyeIcon } from "../icons/CloseEyeIcon";

export const PasswordInput = ({
  value,
  onChange,
  label = "Passwort",
  error,
  isRequired,
  isRepeated,
  name,
  autoComplete,
}: PasswordInputProps) => {
  const [visible, setVisible] = useState(false);
  const inputId = useId();

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value);
  };

  const handleToggleVisibility = () => {
    setVisible(!visible);
  };

  return (
    <div>
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor={inputId}
          className="flex items-center gap-0.5 text-[0.8125rem] font-medium text-color-text-secondary"
        >
          <span>{label}</span>
          {isRequired && (
            <span aria-hidden className="text-color-error-text">
              *
            </span>
          )}
        </label>
        <div
          className={`flex h-11 w-full items-center gap-2 rounded-radius-md border bg-color-bg-card pl-3.5 pr-1.5 transition-[border-color,box-shadow] duration-150 ease-out
    ${
      error
        ? "border-color-error-border"
        : "border-color-border-strong hover:border-color-text-subtle"
    }
    focus-within:border-color-primary focus-within:shadow-[0_0_0_3px_var(--color-focus-ring)]`}
        >
          <input
            type={visible ? "text" : "password"}
            id={inputId}
            aria-invalid={Boolean(error) || undefined}
            name={name}
            autoComplete={autoComplete}
            placeholder={
              isRepeated ? "Passwort erneut eingeben" : "Passwort eingeben"
            }
            value={value}
            onChange={handleInputChange}
            className={`h-full w-full min-w-0 border-0! bg-transparent! shadow-none! focus:outline-none placeholder:text-color-text-subtle placeholder:text-ellipsis placeholder:overflow-hidden ${
              !visible && value
                ? "text-[0.9375rem] tracking-widest text-color-text-main"
                : "text-[0.9375rem] text-color-text-main"
            }`}
          />
          <button
            type="button"
            onClick={handleToggleVisibility}
            aria-label={visible ? "Passwort verbergen" : "Passwort anzeigen"}
            aria-pressed={visible}
            className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-radius-sm text-color-text-subtle transition-all duration-150 hover:bg-color-bg-hover hover:text-color-text-main active:scale-90"
          >
            {value && visible ? (
              <EyeIcon className="h-5 w-5" />
            ) : (
              <CloseEyeIcon className="h-5 w-5" />
            )}
          </button>
        </div>
      </div>
      {error && (
        <p className="mt-1.5 text-[0.8125rem] text-color-error-text animate-slide-down">
          {error}
        </p>
      )}
    </div>
  );
};
