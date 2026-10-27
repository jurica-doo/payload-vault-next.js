"use client";

import { useEffect, useState } from "react";
import { useRegisterSW } from "../../hooks/pwa/useRegisterSW";

const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Non-dismissible update banner. When a new service worker is waiting, a
 * sticky full-width bar appears at the top of the viewport with a single
 * "Jetzt aktualisieren" action — no close button, by design: the bar stays
 * until the user updates, so nobody keeps running a stale version.
 *
 * The "offline ready" info toast lives here too (auto-dismisses, informational
 * only).
 */
export const PwaUpdateBar = () => {
  const [updating, setUpdating] = useState(false);

  const {
    needRefresh: [needRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;
      setInterval(() => {
        registration.update().catch(() => {});
      }, UPDATE_CHECK_INTERVAL_MS);
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

  const update = () => {
    setUpdating(true);
    updateServiceWorker(true);
  };

  return (
    <>
      {needRefresh && (
        <div
          role="alert"
          aria-live="assertive"
          className="fixed inset-x-0 top-0 z-[60] flex flex-wrap items-center justify-center gap-x-4 gap-y-2 border-b border-color-border-light bg-color-surface-raised px-4 py-3 text-color-text-main shadow-shadow-medium animate-slide-down"
          style={{ paddingTop: "calc(env(safe-area-inset-top) + 0.75rem)" }}
        >
          <p className="text-sm">
            <span className="font-semibold">Neue Version verfügbar.</span>{" "}
            <span className="text-color-text-subtle">
              Aktualisieren, um weiterzuarbeiten.
            </span>
          </p>
          <button
            type="button"
            onClick={update}
            disabled={updating}
            className="h-8 cursor-pointer rounded-radius-md bg-color-primary px-4 text-xs font-medium text-color-on-primary transition hover:bg-color-primary-dark active:scale-95 disabled:cursor-default disabled:opacity-60"
          >
            {updating ? "Wird aktualisiert…" : "Jetzt aktualisieren"}
          </button>
        </div>
      )}

      {offlineReady && !needRefresh && (
        <div
          role="status"
          aria-live="polite"
          className="fixed right-4 bottom-4 left-4 z-[9999] max-w-md rounded-radius-lg bg-color-surface-raised p-4 text-color-text-main shadow-shadow-strong ring-1 ring-color-border-light animate-slide-up sm:left-auto"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1rem)" }}
        >
          <p className="text-sm font-medium">
            App ist für Offline-Nutzung bereit.
          </p>
        </div>
      )}
    </>
  );
};
