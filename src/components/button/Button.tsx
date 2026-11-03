import { useContext, useRef, useState } from "react";
import { LoadingIcon } from "../icons/LoadingIcon";
import { FormPendingContext } from "../form/Form";
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
  // A second click while an async onClick or the surrounding <Form> is still
  // running is ignored (P4-R2-01); the ref holds before the re-render.
  const formPending = useContext(FormPendingContext) && type === "submit";
  const busy = useRef(false);
  const [clickPending, setClickPending] = useState(false);
  const loading = isLoading || formPending || clickPending;
  const isButtonDisabled = isDisabled || loading;
  const handleClick = () => {
    if (busy.current || !onClick) return;
    const result = onClick();
    if (result && typeof (result as Promise<unknown>).then === "function") {
      busy.current = true;
      setClickPending(true);
      (result as Promise<unknown>).finally(() => {
        busy.current = false;
        setClickPending(false);
      });
    }
  };
  const Icon = icon;

  return (
    <button
      className={`relative inline-flex select-none items-center justify-center gap-2 rounded-radius-md text-center font-medium leading-none sm:whitespace-nowrap transition-[background-color,border-color,color,box-shadow,transform,scale,filter] duration-150 ease-out focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-color-focus-ring ${
        fullWidth ? "w-full" : "w-auto"
      } ${variantClasses[variant]} ${sizeClasses[size]} ${
        isButtonDisabled
          ? "cursor-not-allowed opacity-55"
          : `cursor-pointer ${onHover[variant]} active:translate-y-0 active:scale-[0.97]`
      } ${className}`}
      disabled={isButtonDisabled}
      aria-busy={loading || undefined}
      aria-label={ariaLabel}
      type={type}
      onClick={type === "submit" && !onClick ? undefined : handleClick}
    >
      {loading ? (
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
