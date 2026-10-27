import { type ButtonVariant, type ButtonSize } from "./Button.types";

const sizeClasses: Record<ButtonSize, string> = {
  small: "h-9 px-3.5 text-sm",
  medium: "h-10 px-4 text-sm",
  large: "h-11 px-5 text-[0.9375rem]",
};

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-color-primary text-color-on-primary shadow-[0_1px_2px_rgba(0,0,0,0.12),inset_0_1px_0_rgba(255,255,255,0.12)]",
  secondary:
    "bg-color-bg-card text-color-text-main border border-color-border-strong",
  ghost: "bg-transparent text-color-text-secondary",
  approve: "bg-color-success text-white",
  decline:
    "bg-color-bg-card text-color-error-text border border-color-error-border/40",
  danger: "bg-color-error text-white",
};

const onHover: Record<ButtonVariant, string> = {
  primary: "hover:bg-color-primary-dark hover:-translate-y-px hover:shadow-shadow-medium",
  secondary: "hover:bg-color-bg-hover hover:border-color-text-subtle",
  ghost: "hover:bg-color-bg-hover hover:text-color-text-main",
  approve: "hover:brightness-110 hover:-translate-y-px hover:shadow-shadow-medium",
  decline: "hover:bg-color-bg-error-subtle hover:border-color-error-border/70",
  danger: "hover:brightness-110 hover:-translate-y-px hover:shadow-shadow-medium",
};

const iconColorByVariant: Record<ButtonVariant, string> = {
  primary: "text-color-on-primary",
  secondary: "text-color-text-secondary",
  ghost: "text-current",
  approve: "text-white",
  decline: "text-color-error-text",
  danger: "text-white",
};

const spinnerColors: Record<ButtonVariant, string> = {
  primary: "currentColor",
  secondary: "currentColor",
  ghost: "currentColor",
  approve: "white",
  decline: "currentColor",
  danger: "white",
};

export {
  sizeClasses,
  variantClasses,
  onHover,
  iconColorByVariant,
  spinnerColors,
};
