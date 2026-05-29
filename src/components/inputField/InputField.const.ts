import type { InputFieldPosition, InputType } from "./InputField.types";

const getInputStyles = (
  position: InputFieldPosition = "full",
  inputType: InputType = "text",
  hasError: boolean = false,
  isReadOnly: boolean = false,
) => {
  const base =
    "py-3 px-3 sm:px-6 font-medium text-[16px] placeholder-color-text-subtle min-w-0 transition-all duration-200 ease-in-out";

  const text = isReadOnly ? "text-color-text-subtle" : "text-color-text-main";

  const positionClasses =
    position === "full"
      ? "rounded-lg"
      : position === "left"
        ? "rounded-l-lg"
        : "rounded-r-lg";

  const colorClasses = isReadOnly
    ? "bg-color-bg-dark border border-color-border-light cursor-not-allowed"
    : hasError
      ? "bg-color-error/10 border border-color-error"
      : "bg-color-bg-dark border border-color-border-light";

  const focusClasses = isReadOnly
    ? "focus:outline-none focus:border-color-border-light"
    : "focus:outline-none focus:border-color-bg-accent";

  const hoverClasses = isReadOnly
    ? ""
    : "hover:shadow-shadow-medium hover:backdrop-blur-[32px]";

  const numberInputWithoutArrows =
    inputType === "number"
      ? "[&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:m-0 [&::-webkit-outer-spin-button]:m-0 [appearance:textfield]"
      : "";

  const placeholderClasses =
    "placeholder-[color:var(--color-text-subtle)] [&::placeholder]:opacity-50 [&::placeholder]:text-ellipsis [&::placeholder]:overflow-hidden";

  return `${base} ${text} ${positionClasses} ${colorClasses} ${focusClasses} ${hoverClasses} ${numberInputWithoutArrows} ${placeholderClasses}`;
};

export { getInputStyles };
