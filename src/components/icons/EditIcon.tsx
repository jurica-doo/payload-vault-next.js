import type { IconProps } from "./Icon.types";

export const EditIcon = ({ size = 24, ...props }: IconProps) => (
  <svg
    fill="currentColor"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <path d="M16.293 2.293a1 1 0 0 1 1.414 0l4 4a1 1 0 0 1 0 1.414l-13 13A1 1 0 0 1 8 21H4a1 1 0 0 1-1-1v-4a1 1 0 0 1 .293-.707l13-13zM5 16.414V19h2.586l12-12L17 4.414l-12 12z" />
  </svg>
);
