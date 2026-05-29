import { useState, type ChangeEvent } from "react";
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
}: PasswordInputProps) => {
  const [visible, setVisible] = useState(false);

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value);
  };

  const handleToggleVisibility = () => {
    setVisible(!visible);
  };

  return (
    <div>
      <div className="flex flex-col gap-2">
        <div className="flex">
          {isRequired && (
            <span className="mr-1 text-[24px] leading-none text-color-text-secondary">
              *
            </span>
          )}
          <label
            htmlFor="password"
            className="text-sm font-semibold text-color-text-secondary"
          >
            {label}
          </label>
        </div>
        <div
          className={`flex h-12 w-full rounded-lg border px-3 py-3 sm:px-6 transition-all duration-200 ease-in-out
    ${
      error
        ? "bg-color-error/10 border-color-error"
        : "border-color-border-light bg-color-bg-dark"
    }
    focus-within:border-color-bg-accent focus-within:shadow-shadow-medium`}
        >
          <input
            type={visible ? "text" : "password"}
            id={label.toLowerCase()}
            placeholder={
              isRepeated ? "Passwort erneut eingeben" : "Passwort eingeben"
            }
            value={value}
            onChange={handleInputChange}
            className={`w-full min-w-0 bg-transparent font-medium focus:outline-none placeholder:text-color-text-subtle placeholder:opacity-50 placeholder:text-ellipsis placeholder:overflow-hidden ${
              !visible && value
                ? "text-[16px] tracking-widest text-color-text-main"
                : "text-[16px] text-color-text-main"
            }`}
          />
          <button
            type="button"
            onClick={handleToggleVisibility}
            className="cursor-pointer"
          >
            {value && visible ? (
              <EyeIcon className="text-color-text-secondary" />
            ) : (
              <CloseEyeIcon className="text-color-text-secondary" />
            )}
          </button>
        </div>
      </div>
      {error && (
        <p className="mt-1 text-[16px] font-medium text-color-error-text">
          {error}
        </p>
      )}
    </div>
  );
};
