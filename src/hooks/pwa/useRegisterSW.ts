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

const SW_URL = "/sw.js";

/**
 * Drop-in replacement for `virtual:pwa-register/react` (vite-plugin-pwa).
 * Registers the service worker at {@link SW_URL} and exposes the same
 * `needRefresh` / `offlineReady` / `updateServiceWorker` API the components
 * already rely on, so the PWA update + offline-ready toasts keep working.
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
      .register(SW_URL)
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

    let reloaded = false;
    const onControllerChange = () => {
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener(
      "controllerchange",
      onControllerChange,
    );

    return () => {
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        onControllerChange,
      );
      void registrationRef;
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
      waiting.postMessage({ type: "SKIP_WAITING" });
      // controllerchange listener triggers the reload
      if (!reloadPage) {
        setNeedRefresh(false);
      }
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
