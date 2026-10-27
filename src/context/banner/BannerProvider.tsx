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

type Toast = BannerState & { id: number; isClosing: boolean };

const MAX_TOASTS = 3;
const DURATION = 5000;
const ERROR_DURATION = 8000;
const EXIT_MS = 220;

/**
 * Toast stack, bottom right (bottom centre on phones). Up to three at once;
 * each closes after 5 s (errors 8 s), and the timer pauses while hovered so
 * nobody loses a message they are reading.
 */
export const BannerProvider = ({ children }: { children: ReactNode }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const nextId = useRef(1);

  const remove = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
    setToasts((list) =>
      list.map((t) => (t.id === id ? { ...t, isClosing: true } : t)),
    );
    setTimeout(
      () => setToasts((list) => list.filter((t) => t.id !== id)),
      EXIT_MS,
    );
  }, []);

  const schedule = useCallback(
    (id: number, type: BannerType) => {
      timers.current.set(
        id,
        setTimeout(
          () => remove(id),
          type === "error" ? ERROR_DURATION : DURATION,
        ),
      );
    },
    [remove],
  );

  const showBanner = useCallback(
    (title: string, description: string, bannerType: BannerType) => {
      const id = nextId.current++;
      setToasts((list) => {
        const live = list.filter((t) => !t.isClosing);
        const overflow = live.slice(0, Math.max(0, live.length - (MAX_TOASTS - 1)));
        overflow.forEach((t) => {
          const timer = timers.current.get(t.id);
          if (timer) clearTimeout(timer);
          timers.current.delete(t.id);
        });
        const dropped = new Set(overflow.map((t) => t.id));
        return [
          ...list.filter((t) => !dropped.has(t.id)),
          { id, title, description, bannerType, isClosing: false },
        ];
      });
      schedule(id, bannerType);
    },
    [schedule],
  );

  const pause = (id: number) => {
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
  };

  const latest = [...toasts].reverse().find((t) => !t.isClosing) ?? null;

  const closeBanner = useCallback(() => {
    if (latest) remove(latest.id);
  }, [latest, remove]);

  useEffect(() => {
    const map = timers.current;
    return () => map.forEach(clearTimeout);
  }, []);

  return (
    <BannerContext.Provider
      value={{
        banner: latest
          ? {
              title: latest.title,
              description: latest.description,
              bannerType: latest.bannerType,
            }
          : null,
        showBanner,
        closeBanner,
      }}
    >
      {children}
      <div
        role="region"
        aria-label="Benachrichtigungen"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-110 flex flex-col items-center gap-2 sm:inset-x-auto sm:right-5 sm:bottom-5 sm:items-end"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.bannerType === "error" ? "alert" : "status"}
            className={`pointer-events-auto ${
              t.isClosing ? "animate-slide-out-right" : "animate-slide-in-right"
            }`}
            onMouseEnter={() => pause(t.id)}
            onMouseLeave={() => !t.isClosing && schedule(t.id, t.bannerType)}
          >
            <Banner
              title={t.title}
              description={t.description}
              bannerType={t.bannerType}
              onCloseBanner={() => remove(t.id)}
            />
          </div>
        ))}
      </div>
    </BannerContext.Provider>
  );
};
