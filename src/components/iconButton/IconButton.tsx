import type { ComponentType, MouseEvent } from "react";
import type { IconProps } from "../icons/Icon.types";

type IconButtonProps = {
  icon: ComponentType<IconProps>;
  /** Required: icon-only buttons need an accessible name. */
  label: string;
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void;
  tone?: "neutral" | "danger";
  size?: "sm" | "md";
  disabled?: boolean;
  type?: "button" | "submit";
};

/** Square icon-only button with a tooltip (title) and press feedback. */
export const IconButton = ({
  icon: Icon,
  label,
  onClick,
  tone = "neutral",
  size = "md",
  disabled,
  type = "button",
}: IconButtonProps) => (
  <button
    type={type}
    aria-label={label}
    title={label}
    disabled={disabled}
    onClick={onClick}
    className={`inline-flex shrink-0 cursor-pointer items-center justify-center rounded-radius-md text-color-text-subtle transition-all duration-150 active:scale-90 disabled:cursor-not-allowed disabled:opacity-40 ${
      size === "sm" ? "h-8 w-8" : "h-9 w-9"
    } ${
      tone === "danger"
        ? "hover:bg-color-bg-error-subtle hover:text-color-error-text"
        : "hover:bg-color-bg-hover hover:text-color-text-main"
    }`}
  >
    <Icon size={size === "sm" ? 16 : 18} className="h-[18px] w-[18px]" />
  </button>
);
