import type { BorderStyle } from "./Dropdown.types";

export const radiusVariants: Record<BorderStyle, string> = {
  default: "rounded-radius-md",
  "left-flat": "rounded-radius-md rounded-l-none",
  "right-flat": "rounded-radius-md rounded-r-none",
};
