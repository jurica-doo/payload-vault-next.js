import { createContext, useContext } from "react";
import type { BannerType } from "../../components/banner/Banner.types";

export interface BannerState {
  title: string;
  description: string;
  bannerType: BannerType;
}

interface BannerContextValue {
  banner: BannerState | null;
  showBanner: (
    title: string,
    description: string,
    bannerType: BannerType
  ) => void;
  closeBanner: () => void;
}

export const BannerContext = createContext<BannerContextValue | undefined>(
  undefined
);

export const useBanner = () => {
  const context = useContext(BannerContext);
  if (!context) {
    throw new Error("useBanner must be used within a BannerProvider");
  }
  return context;
};
