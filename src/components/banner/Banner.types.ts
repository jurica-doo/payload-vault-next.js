type BannerType = "success" | "error" | "info" | "warning";

type BannerProps = {
  bannerType: BannerType;
  title: string;
  description: string;
  onCloseBanner?: () => void;
  onPrimaryActionClick?: () => void;
};

export type { BannerProps, BannerType };
