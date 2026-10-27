import { XIcon } from "../icons";
import { type BannerProps } from "./Banner.types";
import { bannerStyle, bannerIcon, bannerIconStyle } from "./Banner.const";

export const Banner = ({
  bannerType,
  title,
  description,
  onCloseBanner,
}: BannerProps) => {
  const Icon = bannerIcon[bannerType];

  return (
    <div
      className={`${
        onCloseBanner ? "w-[min(22rem,calc(100vw-2rem))]" : "w-full"
      } relative flex items-start gap-3 overflow-hidden rounded-radius-lg bg-color-surface-raised py-3 pl-4 pr-10 shadow-shadow-strong ring-1 ring-color-border-light before:absolute before:inset-y-0 before:left-0 before:w-1 ${
        bannerStyle[bannerType]
      }`}
    >
      <span
        className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${bannerIconStyle[bannerType]} ${
          bannerType === "success" ? "animate-pop-in" : ""
        }`}
      >
        <Icon size={16} />
      </span>
      <div className="flex min-w-0 flex-col gap-0.5">
        <p className="text-sm font-semibold leading-snug text-color-text-main">
          {title}
        </p>
        {description && (
          <p className="text-[0.8125rem] leading-snug text-color-text-subtle">
            {description}
          </p>
        )}
      </div>
      {onCloseBanner && (
        <button
          type="button"
          onClick={onCloseBanner}
          aria-label="Meldung schließen"
          className="absolute right-2 top-2 flex cursor-pointer items-center justify-center rounded-radius-md p-1.5 text-color-text-subtle transition-all duration-150 hover:bg-color-bg-hover hover:text-color-text-main active:scale-90"
        >
          <XIcon size={16} />
        </button>
      )}
    </div>
  );
};
