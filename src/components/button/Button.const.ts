import { type ButtonVariant, type ButtonSize } from "./Button.types";

const sizeClasses: Record<ButtonSize, string> = {
  small: "min-h-10 px-3 py-2",
  medium: "min-h-12 p-3",
  large: "min-h-14 px-6 py-4",
};

const variantClasses: Record<ButtonVariant, string> = {
  primary: "bg-color-primary text-black",
  secondary: "bg-color-secondary text-black",
  approve: "bg-color-success-border text-white",
  decline: "bg-color-error-border text-white",
};

const onHover: Record<ButtonVariant, string> = {
  primary: "hover:bg-color-primary/80",
  secondary: "hover:bg-color-secondary/80",
  decline: "hover:bg-color-error-border/80",
  approve: "hover:bg-color-success-border/80",
};

const iconColorByVariant: Record<ButtonVariant, string> = {
  primary: "text-black",
  secondary: "text-black",
  approve: "text-white",
  decline: "text-white",
};

const spinnerColors: Record<ButtonVariant, string> = {
  primary: "black",
  secondary: "black",
  approve: "white",
  decline: "white",
};

export {
  sizeClasses,
  variantClasses,
  onHover,
  iconColorByVariant,
  spinnerColors,
};
