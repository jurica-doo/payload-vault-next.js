"use client";

import { useEffect, useState, type Dispatch, type SetStateAction } from "react";

type RegisterSWOptions = {
  onRegisteredSW?: (
    swScriptUrl: string,
    registration?: ServiceWorkerRegistration,
  ) => void;
  onRegisterError?: (error: unknown) => void;
};

type UseRegisterSWReturn = {
  needRefresh: [boolean, Dispatch<SetStateAction<boolean>>];
  offlineReady: [boolean, Dispatch<SetStateAction<boolean>>];
  updateServiceWorker: (reloadPage?: boolean) => Promise<void>;
};

// The build id in the URL makes every deploy register as a NEW service worker,
// which is what lets the update bar detect new versions (a byte-identical
// sw.js would never fire `updatefound`).
const SW_URL = `/sw.js?v=${process.env.NEXT_PUBLIC_SW_VERSION ?? "dev"}`;

/**
 * Drop-in replacement for `virtual:pwa-register/react` (vite-plugin-pwa).
 * Registers the versioned service worker and exposes the same
 * `needRefresh` / `offlineReady` / `updateServiceWorker` API the components
 * already rely on.
 */
export function useRegisterSW(
  options: RegisterSWOptions = {},
): UseRegisterSWReturn {
  const { onRegisteredSW, onRegisterError } = options;

  const [needRefresh, setNeedRefresh] = useState(false);
  const [offlineReady, setOfflineReady] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    let registrationRef: ServiceWorkerRegistration | undefined;

    const trackWaiting = (registration: ServiceWorkerRegistration) => {
      const waiting = registration.waiting;
      if (waiting && navigator.serviceWorker.controller) {
        setNeedRefresh(true);
      }
    };

    const onUpdateFound = (registration: ServiceWorkerRegistration) => {
      const installing = registration.installing;
      if (!installing) return;
      installing.addEventListener("statechange", () => {
        if (installing.state === "installed") {
          if (navigator.serviceWorker.controller) {
            setNeedRefresh(true);
          } else {
            setOfflineReady(true);
          }
        }
      });
    };

    navigator.serviceWorker
      .register(SW_URL, { updateViaCache: "none" })
      .then((registration) => {
        registrationRef = registration;
        onRegisteredSW?.(SW_URL, registration);

        trackWaiting(registration);
        registration.addEventListener("updatefound", () =>
          onUpdateFound(registration),
        );
      })
      .catch((error) => {
        onRegisterError?.(error);
      });

    // Only reload on controllerchange when the page was ALREADY controlled:
    // on the very first visit the fresh worker claims the page, which fires
    // controllerchange too — reloading there would restart every first visit.
    const hadController = !!navigator.serviceWorker.controller;
    let reloaded = false;
    const onControllerChange = () => {
      if (!hadController || reloaded) return;
      reloaded = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener(
      "controllerchange",
      onControllerChange,
    );

    // Proactively check for a new deploy when the app regains focus or
    // connectivity — catches installed PWAs left open for days.
    const checkForUpdate = () => {
      registrationRef?.update().catch(() => {});
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") checkForUpdate();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("online", checkForUpdate);

    return () => {
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        onControllerChange,
      );
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("online", checkForUpdate);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateServiceWorker = async (reloadPage = true) => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }
    const registration = await navigator.serviceWorker.getRegistration(SW_URL);
    const waiting = registration?.waiting;
    if (waiting) {
      if (reloadPage) {
        // Reload as soon as the new worker takes control; the timeout is a
        // safety net in case controllerchange never fires (e.g. the waiting
        // worker died).
        navigator.serviceWorker.addEventListener(
          "controllerchange",
          () => window.location.reload(),
          { once: true },
        );
        setTimeout(() => window.location.reload(), 3000);
      } else {
        setNeedRefresh(false);
      }
      waiting.postMessage({ type: "SKIP_WAITING" });
    } else if (reloadPage) {
      window.location.reload();
    }
  };

  return {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  };
}
