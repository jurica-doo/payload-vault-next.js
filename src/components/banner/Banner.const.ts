import type { ComponentType } from "react";
import { type BannerType } from "./Banner.types";
import {
  AlertCircleIcon,
  AlertTriangleIcon,
  CheckCircleIcon,
  InfoIcon,
} from "../icons";
import type { IconProps } from "../icons/Icon.types";

const buttonText: Record<BannerType, string> = {
  success: "Rückgängig",
  error: "Wiederholen",
  info: "OK",
  warning: "OK",
};

/** Accent stripe + icon tint; the toast body itself stays neutral. */
const bannerStyle: Record<BannerType, string> = {
  success: "before:bg-color-success-border",
  error: "before:bg-color-error-border",
  info: "before:bg-color-info",
  warning: "before:bg-color-warning",
};

const bannerIconStyle: Record<BannerType, string> = {
  success: "text-color-success-text bg-color-success/12",
  error: "text-color-error-text bg-color-bg-error-subtle",
  info: "text-color-info-text bg-color-bg-info-subtle",
  warning: "text-color-warning-text bg-color-bg-warning-subtle",
};

const bannerIcon: Record<BannerType, ComponentType<IconProps>> = {
  success: CheckCircleIcon,
  error: AlertCircleIcon,
  info: InfoIcon,
  warning: AlertTriangleIcon,
};

export { buttonText, bannerStyle, bannerIconStyle, bannerIcon };
