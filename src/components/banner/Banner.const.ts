import { type BannerType } from "./Banner.types";

const buttonText: Record<BannerType, string> = {
  success: "Rückgängig",
  error: "Wiederholen",
};

const bannerStyle: Record<BannerType, string> = {
  success: "border-color-success-border/40 bg-color-success",
  error: "border-color-error-border/40 bg-color-error",
};
export { buttonText, bannerStyle };
