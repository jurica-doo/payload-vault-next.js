import type { IconProps } from "./Icon.types";

export const ArrowBackIcon = ({ size = 24, ...props }: IconProps) => (
  <svg
    fill="currentColor"
    width={size}
    viewBox="0 0 24 24"
    id="left"
    data-name="Flat Color"
    xmlns="http://www.w3.org/2000/svg"
    className="icon flat-color"
    {...props}
  >
    <path
      id="primary"
      d="M21,11H5.41l5.3-5.29A1,1,0,1,0,9.29,4.29l-7,7a1,1,0,0,0,0,1.42l7,7a1,1,0,0,0,1.42,0,1,1,0,0,0,0-1.42L5.41,13H21a1,1,0,0,0,0-2Z"
      style={{
        fill: "currentColor",
      }}
    />
  </svg>
);
