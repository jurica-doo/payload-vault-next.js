import type { BorderStyle } from "./Dropdown.types";

export const radiusVariants: Record<BorderStyle, string> = {
  default: "rounded-md",
  "left-flat": "rounded-md rounded-l-none",
  "right-flat": "rounded-md rounded-r-none",
};
