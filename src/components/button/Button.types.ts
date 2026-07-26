import { type ComponentType, type SVGProps } from "react";

type ButtonVariant = "primary" | "secondary" | "approve" | "decline";
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
}

export type { ButtonProps, ButtonVariant, ButtonSize };
