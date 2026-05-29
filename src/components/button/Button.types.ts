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
  onClick: () => void;
}

export type { ButtonProps, ButtonVariant, ButtonSize };
