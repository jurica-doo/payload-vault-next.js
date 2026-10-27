import { type ComponentType, type SVGProps } from "react";

/**
 * primary   – the one dominant action of a screen or dialog
 * secondary – neutral outlined action next to a primary
 * ghost     – low-emphasis text action (reset, cancel in toolbars)
 * approve   – positive decision in approval flows
 * decline   – negative decision / destructive option, outlined
 * danger    – confirmed destructive action (solid red, e.g. "Löschen")
 */
type ButtonVariant =
  | "primary"
  | "secondary"
  | "ghost"
  | "approve"
  | "decline"
  | "danger";
type ButtonSize = "small" | "medium" | "large";

interface ButtonProps {
  text: string;
  isLoading?: boolean;
  isDisabled?: boolean;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ComponentType<SVGProps<SVGSVGElement>>;
  /** "submit" inside a <form> lets Enter trigger it; default "button". */
  type?: "button" | "submit";
  onClick?: () => void;
  fullWidth?: boolean;
  className?: string;
  ariaLabel?: string;
}

export type { ButtonProps, ButtonVariant, ButtonSize };
