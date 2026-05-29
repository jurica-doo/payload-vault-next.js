import { CloseIcon } from "../icons/CloseIcon";
import { type BannerProps } from "./Banner.types";
import { bannerStyle } from "./Banner.const";

export const Banner = ({
  bannerType,
  title,
  description,
  onCloseBanner,
}: BannerProps) => {
  return (
    <div
      className={`${
        onCloseBanner ? "w-70" : "w-full"
      } relative flex h-auto flex-col items-start justify-start rounded-md border px-3 py-2.5 shadow-[4px_4px_32px_0px_#0000001F] backdrop-blur-[32px] ${
        bannerStyle[bannerType]
      }`}
    >
      <p className="align-middle text-[14px] leading-[140%] font-bold text-white">
        {title}
      </p>
      <p className="w-11/12 align-middle text-[14px] leading-[140%] font-medium text-white">
        {description}
      </p>
      {onCloseBanner && (
        <button
          onClick={onCloseBanner}
          className="absolute top-1 right-1 flex cursor-pointer items-center justify-center rounded-md p-1 transition-all duration-200 hover:bg-white/20 active:scale-90"
        >
          <CloseIcon className="h-6 w-6 shrink-0 text-white" />
        </button>
      )}
    </div>
  );
};
