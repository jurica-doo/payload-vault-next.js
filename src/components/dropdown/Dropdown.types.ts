import type { ComponentType, SVGProps } from "react";

export type BorderStyle = "default" | "left-flat" | "right-flat";

export type Option = {
  id: string;
  label: string;
  /** Listed but not selectable (greyed out, skipped by the keyboard). */
  disabled?: boolean;
  icon?: ComponentType<SVGProps<SVGSVGElement>>;
};

export type DropdownProps = {
  options: Option[];
  value: Option | null;
  onSelect: (option: Option) => void;
  label?: string;
  placeholder?: string;
  isRequired?: boolean;
  customIcon?: ComponentType<SVGProps<SVGSVGElement>>;
  isSearchEnabled?: boolean;
  variant?: BorderStyle;
  error?: string;
  /** Compact 32 px trigger (e.g. the pagination size picker). */
  size?: "sm" | "md";
  /** Side to try first; the list flips when there is no room there. */
  placement?: "bottom" | "top";
  /** Accessible name when there is no visible label. */
  ariaLabel?: string;
  isDisabled?: boolean;
};
