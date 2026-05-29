type BannerType = "success" | "error";

type BannerProps = {
  bannerType: BannerType;
  title: string;
  description: string;
  onCloseBanner?: () => void;
  onPrimaryActionClick?: () => void;
};

export type { BannerProps, BannerType };
