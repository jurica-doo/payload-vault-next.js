import type { IconProps } from "./Icon.types";

export const CameraIcon = ({ size = 20, ...props }: IconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <path
      d="M9 4.5H15L16.2 6H19C20.1046 6 21 6.89543 21 8V17C21 18.1046 20.1046 19 19 19H5C3.89543 19 3 18.1046 3 17V8C3 6.89543 3.89543 6 5 6H7.8L9 4.5Z"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <circle cx="12" cy="12.5" r="3.5" stroke="currentColor" strokeWidth="1.8" />
  </svg>
);
