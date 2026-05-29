import type { ComponentType, SVGProps } from "react";

export type BorderStyle = "default" | "left-flat" | "right-flat";

export type Option = {
  id: string;
  label: string;
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
};
