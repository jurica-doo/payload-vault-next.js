import {
  type ReactNode,
  useState,
  useCallback,
  useRef,
  useEffect,
} from "react";
import { Banner } from "../../components/banner/Banner";
import type { BannerType } from "../../components/banner/Banner.types";
import { BannerContext, type BannerState } from "./BannerContext";

export const BannerProvider = ({ children }: { children: ReactNode }) => {
  const [banner, setBanner] = useState<BannerState | null>(null);
  const [isClosing, setIsClosing] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeAnimRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismissBanner = useCallback(() => {
    setIsClosing(true);
    closeAnimRef.current = setTimeout(() => {
      setBanner(null);
      setIsClosing(false);
      closeAnimRef.current = null;
    }, 250);
  }, []);

  const showBanner = useCallback(
    (title: string, description: string, bannerType: BannerType) => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (closeAnimRef.current) {
        clearTimeout(closeAnimRef.current);
        closeAnimRef.current = null;
      }

      setIsClosing(false);
      setBanner({ title, description, bannerType });

      timeoutRef.current = setTimeout(() => {
        dismissBanner();
        timeoutRef.current = null;
      }, 5000);
    },
    [dismissBanner],
  );

  const closeBanner = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    dismissBanner();
  }, [dismissBanner]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (closeAnimRef.current) clearTimeout(closeAnimRef.current);
    };
  }, []);

  return (
    <BannerContext.Provider value={{ banner, showBanner, closeBanner }}>
      {children}
      {banner && (
        <div
          className={`fixed bottom-4 right-4 z-100 ${isClosing ? "animate-slide-out-right" : "animate-slide-in-right"}`}
        >
          <Banner
            title={banner.title}
            description={banner.description}
            bannerType={banner.bannerType}
            onCloseBanner={closeBanner}
          />
        </div>
      )}
    </BannerContext.Provider>
  );
};
