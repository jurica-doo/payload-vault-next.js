import type { InputFieldPosition, InputType } from "./InputField.types";

const getInputStyles = (
  position: InputFieldPosition = "full",
  inputType: InputType = "text",
  hasError: boolean = false,
  isReadOnly: boolean = false,
) => {
  const base =
    "min-h-11 py-2.5 leading-6 px-3.5 text-[0.9375rem] placeholder-color-text-subtle min-w-0 transition-[border-color,box-shadow,background-color] duration-150 ease-out";

  const text = isReadOnly ? "text-color-text-subtle" : "text-color-text-main";

  const positionClasses =
    position === "full"
      ? "rounded-radius-md"
      : position === "left"
        ? "rounded-l-radius-md"
        : "rounded-r-radius-md";

  const colorClasses = isReadOnly
    ? "bg-color-bg-alt border border-color-border-light cursor-not-allowed"
    : hasError
      ? "bg-color-bg-card border border-color-error-border"
      : "bg-color-bg-card border border-color-border-strong";

  const focusClasses = isReadOnly
    ? "focus:outline-none focus:border-color-border-light focus:shadow-none"
    : hasError
      ? "focus:outline-none focus:border-color-error-border focus:shadow-[0_0_0_3px_rgba(220,38,38,0.18)]"
      : "focus:outline-none focus:border-color-primary focus:shadow-[0_0_0_3px_var(--color-focus-ring)]";

  const hoverClasses = isReadOnly
    ? ""
    : "hover:border-color-text-subtle";

  const numberInputWithoutArrows =
    inputType === "number"
      ? "[&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:m-0 [&::-webkit-outer-spin-button]:m-0 [appearance:textfield]"
      : "";

  const placeholderClasses =
    "placeholder-[color:var(--color-text-subtle)] [&::placeholder]:opacity-50 [&::placeholder]:text-ellipsis [&::placeholder]:overflow-hidden";

  return `${base} ${text} ${positionClasses} ${colorClasses} ${focusClasses} ${hoverClasses} ${numberInputWithoutArrows} ${placeholderClasses}`;
};

export { getInputStyles };
