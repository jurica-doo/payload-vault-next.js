import type { IconProps } from "./Icon.types";

export const CloseEyeIcon = ({ size = 24, ...props }: IconProps) => (
  <svg
    id="Layer_1"
    xmlns="http://www.w3.org/2000/svg"
    xmlnsXlink="http://www.w3.org/1999/xlink"
    width={size}
    viewBox="0 0 64 64"
    enableBackground="new 0 0 64 64"
    xmlSpace="preserve"
    {...props}
  >
    <path
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeMiterlimit={10}
      d="M1,32c0,0,11,15,31,15s31-15,31-15S52,17,32,17 S1,32,1,32z"
    />
    <circle
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeMiterlimit={10}
      cx={32}
      cy={32}
      r={7}
    />
    <line
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeMiterlimit={10}
      x1={9}
      y1={55}
      x2={55}
      y2={9}
    />
  </svg>
);
