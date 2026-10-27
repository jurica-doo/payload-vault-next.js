import type { ReactNode } from "react";
import type { IconProps } from "./Icon.types";

/**
 * Outline icons for navigation and UI chrome: 24px grid, 1.75 stroke,
 * currentColor. Same `size` API as the filled icons next to this file.
 */
const lineIcon = (paths: ReactNode, displayName: string) => {
  const Icon = ({ size = 20, ...props }: IconProps) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {paths}
    </svg>
  );
  Icon.displayName = displayName;
  return Icon;
};

export const HomeIcon = lineIcon(
  <>
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5" />
  </>,
  "HomeIcon",
);

export const WalletIcon = lineIcon(
  <>
    <path d="M19 7V5a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4" />
    <path d="M3 6v12a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-3" />
    <path d="M21 12h-4a2 2 0 0 0 0 4h4z" />
  </>,
  "WalletIcon",
);

export const ReceiptIcon = lineIcon(
  <>
    <path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2z" />
    <path d="M9 8h6M9 12h6M9 16h3" />
  </>,
  "ReceiptIcon",
);

export const ChartBarIcon = lineIcon(
  <>
    <path d="M3 21h18" />
    <rect x="5" y="11" width="3" height="7" rx="0.5" />
    <rect x="10.5" y="6" width="3" height="12" rx="0.5" />
    <rect x="16" y="13" width="3" height="5" rx="0.5" />
  </>,
  "ChartBarIcon",
);

export const TrendIcon = lineIcon(
  <>
    <path d="m3 17 6-6 4 4 8-8" />
    <path d="M15 7h6v6" />
  </>,
  "TrendIcon",
);

export const GaugeIcon = lineIcon(
  <>
    <path d="M12 14 16 9" />
    <path d="M3.5 18a9 9 0 1 1 17 0" />
    <circle cx="12" cy="14" r="1.25" />
  </>,
  "GaugeIcon",
);

export const BriefcaseIcon = lineIcon(
  <>
    <rect x="3" y="7" width="18" height="13" rx="2" />
    <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    <path d="M3 13h18" />
  </>,
  "BriefcaseIcon",
);

export const AwardIcon = lineIcon(
  <>
    <circle cx="12" cy="9" r="6" />
    <path d="m8.5 14 -1.5 7 5-3 5 3-1.5-7" />
  </>,
  "AwardIcon",
);

export const UsersIcon = lineIcon(
  <>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
    <path d="M16 4.5a3.5 3.5 0 0 1 0 7" />
    <path d="M18 14.2A6.5 6.5 0 0 1 21.5 20" />
  </>,
  "UsersIcon",
);

export const CoinsIcon = lineIcon(
  <>
    <ellipse cx="9" cy="7" rx="6" ry="3" />
    <path d="M3 7v5c0 1.66 2.69 3 6 3s6-1.34 6-3V7" />
    <path d="M3 12v5c0 1.66 2.69 3 6 3 1.3 0 2.5-.2 3.5-.56" />
    <path d="M15 12.5c3.3 0 6 1.34 6 3s-2.7 3-6 3" />
  </>,
  "CoinsIcon",
);

export const TargetIcon = lineIcon(
  <>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="5" />
    <circle cx="12" cy="12" r="1" />
  </>,
  "TargetIcon",
);

export const FunnelIcon = lineIcon(
  <path d="M3 4h18l-7 8.5V19l-4 2v-8.5z" />,
  "FunnelIcon",
);

export const ChecklistIcon = lineIcon(
  <>
    <path d="m4 6 1.5 1.5L8 5" />
    <path d="m4 12 1.5 1.5L8 11" />
    <path d="m4 18 1.5 1.5L8 17" />
    <path d="M11 6h9M11 12h9M11 18h9" />
  </>,
  "ChecklistIcon",
);

export const ContactIcon = lineIcon(
  <>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <circle cx="9" cy="11" r="2.5" />
    <path d="M5.5 17a3.5 3.5 0 0 1 7 0" />
    <path d="M15 10h3M15 14h3" />
  </>,
  "ContactIcon",
);

export const ShieldIcon = lineIcon(
  <>
    <path d="M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6z" />
    <path d="m9 12 2 2 4-4" />
  </>,
  "ShieldIcon",
);

export const SettingsIcon = lineIcon(
  <>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </>,
  "SettingsIcon",
);

export const MailIcon = lineIcon(
  <>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="m3.5 6.5 8.5 6 8.5-6" />
  </>,
  "MailIcon",
);

export const ActivityIcon = lineIcon(
  <path d="M3 12h4l3-8 4 16 3-8h4" />,
  "ActivityIcon",
);

export const BellIcon = lineIcon(
  <>
    <path d="M6 9a6 6 0 0 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9" />
    <path d="M10 20a2 2 0 0 0 4 0" />
  </>,
  "BellIcon",
);

export const ChevronDownIcon = lineIcon(
  <path d="m6 9 6 6 6-6" />,
  "ChevronDownIcon",
);

export const ChevronRightIcon = lineIcon(
  <path d="m9 6 6 6-6 6" />,
  "ChevronRightIcon",
);

export const ChevronLeftIcon = lineIcon(
  <path d="m15 6-6 6 6 6" />,
  "ChevronLeftIcon",
);

export const PanelLeftIcon = lineIcon(
  <>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M9 4v16" />
  </>,
  "PanelLeftIcon",
);

export const MenuIcon = lineIcon(
  <path d="M4 6h16M4 12h16M4 18h16" />,
  "MenuIcon",
);

export const DotsIcon = lineIcon(
  <>
    <circle cx="5" cy="12" r="1" fill="currentColor" />
    <circle cx="12" cy="12" r="1" fill="currentColor" />
    <circle cx="19" cy="12" r="1" fill="currentColor" />
  </>,
  "DotsIcon",
);

export const XIcon = lineIcon(<path d="M18 6 6 18M6 6l12 12" />, "XIcon");

export const CheckIcon = lineIcon(<path d="m5 12 5 5 9-10" />, "CheckIcon");

export const CheckCircleIcon = lineIcon(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="m8 12 3 3 5-6" />
  </>,
  "CheckCircleIcon",
);

export const AlertCircleIcon = lineIcon(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 8v4.5M12 16h.01" />
  </>,
  "AlertCircleIcon",
);

export const AlertTriangleIcon = lineIcon(
  <>
    <path d="M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0" />
    <path d="M12 9v4M12 17h.01" />
  </>,
  "AlertTriangleIcon",
);

export const InfoIcon = lineIcon(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5M12 8h.01" />
  </>,
  "InfoIcon",
);

export const PlusIcon = lineIcon(<path d="M12 5v14M5 12h14" />, "PlusIcon");

export const RefreshIcon = lineIcon(
  <>
    <path d="M20 11a8 8 0 0 0-14.6-4.5L4 8" />
    <path d="M4 4v4h4" />
    <path d="M4 13a8 8 0 0 0 14.6 4.5L20 16" />
    <path d="M20 20v-4h-4" />
  </>,
  "RefreshIcon",
);

export const MonitorIcon = lineIcon(
  <>
    <rect x="3" y="4" width="18" height="12" rx="2" />
    <path d="M8 20h8M12 16v4" />
  </>,
  "MonitorIcon",
);

export const FileTextIcon = lineIcon(
  <>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
    <path d="M14 3v5h5M9 13h6M9 17h4" />
  </>,
  "FileTextIcon",
);

export const InboxIcon = lineIcon(
  <>
    <path d="M3 13h5l1.5 3h5L16 13h5" />
    <path d="M5.5 5h13L21 13v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5z" />
  </>,
  "InboxIcon",
);

export const KeyIcon = lineIcon(
  <>
    <circle cx="7.5" cy="15.5" r="4" />
    <path d="m10.5 12.5 9.5-9.5M16 7l3 3M14 9l2 2" />
  </>,
  "KeyIcon",
);

export const LogOutIcon = lineIcon(
  <>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <path d="m16 17 5-5-5-5M21 12H9" />
  </>,
  "LogOutIcon",
);

export const ExportIcon = lineIcon(
  <>
    <path d="M12 3v12M7 8l5-5 5 5" />
    <path d="M5 15v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4" />
  </>,
  "ExportIcon",
);
