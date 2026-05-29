"use client";

import { useEffect, useState } from "react";
import { useRegisterSW } from "../../hooks/pwa/useRegisterSW";

const RELOAD_INTERVAL_MS = 60 * 60 * 1000;

export const PwaUpdateToast = () => {
  const [dismissed, setDismissed] = useState(false);

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;
      setInterval(() => {
        registration.update().catch(() => {});
      }, RELOAD_INTERVAL_MS);
    },
    onRegisterError(error) {
      console.error("SW registration failed", error);
    },
  });

  useEffect(() => {
    if (offlineReady) {
      const t = setTimeout(() => setOfflineReady(false), 4000);
      return () => clearTimeout(t);
    }
  }, [offlineReady, setOfflineReady]);

  const close = () => {
    setOfflineReady(false);
    setNeedRefresh(false);
    setDismissed(true);
  };

  const reload = () => {
    updateServiceWorker(true);
  };

  if (dismissed && !needRefresh && !offlineReady) return null;
  if (!needRefresh && !offlineReady) return null;

  return (
    <div
      role="alert"
      aria-live="polite"
      className="fixed right-4 bottom-4 left-4 z-[9999] flex max-w-md flex-col gap-2 rounded-xl border border-[#00c4b3]/40 bg-[#0d0d0d]/95 p-4 text-white shadow-2xl backdrop-blur-md sm:left-auto"
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1rem)" }}
    >
      {needRefresh ? (
        <>
          <p className="text-sm font-semibold">Neue Version verfügbar</p>
          <p className="text-xs opacity-80">
            Aktualisieren, um die neueste Version zu laden.
          </p>
          <div className="mt-1 flex gap-2">
            <button
              type="button"
              onClick={reload}
              className="cursor-pointer rounded-md bg-[#00c4b3] px-3 py-1.5 text-xs font-semibold text-black transition hover:bg-[#33d1c2] active:scale-95"
            >
              Neu laden
            </button>
            <button
              type="button"
              onClick={close}
              className="cursor-pointer rounded-md border border-white/20 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-white/10 active:scale-95"
            >
              Später
            </button>
          </div>
        </>
      ) : (
        <p className="text-sm font-medium">App ist für Offline-Nutzung bereit.</p>
      )}
    </div>
  );
};
