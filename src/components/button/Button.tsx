import { LoadingIcon } from "../icons/LoadingIcon";
import { type ButtonProps } from "./Button.types";
import {
  sizeClasses,
  variantClasses,
  onHover,
  spinnerColors,
  iconColorByVariant,
} from "./Button.const";

export const Button = ({
  text,
  isLoading = false,
  isDisabled = false,
  size = "small",
  variant = "primary",
  icon,
  type = "button",
  onClick,
  fullWidth = false,
  className = "",
  ariaLabel,
}: ButtonProps) => {
  const isButtonDisabled = isDisabled || isLoading;
  const Icon = icon;

  return (
    <button
      className={`relative inline-flex select-none items-center justify-center gap-2 rounded-radius-md text-center font-medium leading-none sm:whitespace-nowrap transition-[background-color,border-color,color,box-shadow,transform,filter] duration-150 ease-out focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-color-focus-ring ${
        fullWidth ? "w-full" : "w-auto"
      } ${variantClasses[variant]} ${sizeClasses[size]} ${
        isButtonDisabled
          ? "cursor-not-allowed opacity-55"
          : `cursor-pointer ${onHover[variant]} active:translate-y-0 active:scale-[0.97]`
      } ${className}`}
      disabled={isButtonDisabled}
      aria-busy={isLoading || undefined}
      aria-label={ariaLabel}
      type={type}
      onClick={onClick}
    >
      {isLoading ? (
        <LoadingIcon
          color={spinnerColors[variant]}
          className="h-4 w-4 shrink-0 animate-spin"
        />
      ) : (
        Icon && (
          <Icon
            className={`h-[18px] w-[18px] shrink-0 ${iconColorByVariant[variant]}`}
          />
        )
      )}
      {text}
    </button>
  );
};
