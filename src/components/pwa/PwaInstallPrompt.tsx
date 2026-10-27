"use client";

import { useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "pwa-install-dismissed-at";
const DISMISS_TTL_MS = 1000 * 60 * 60 * 24 * 14;

const isStandalone = () => {
  if (typeof window === "undefined") return false;
  if (window.matchMedia("(display-mode: standalone)").matches) return true;
  return (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
};

const isIos = () => {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const iPadOS = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  return /iPhone|iPad|iPod/.test(ua) || iPadOS;
};

const dismissedRecently = () => {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const ts = Number(raw);
    return Number.isFinite(ts) && Date.now() - ts < DISMISS_TTL_MS;
  } catch {
    return false;
  }
};

export const PwaInstallPrompt = () => {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [show, setShow] = useState(false);
  const [showIosHint, setShowIosHint] = useState(false);

  useEffect(() => {
    if (isStandalone() || dismissedRecently()) return;

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setShow(true);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);

    const onInstalled = () => {
      setShow(false);
      setDeferred(null);
    };
    window.addEventListener("appinstalled", onInstalled);

    if (isIos()) {
      const t = setTimeout(() => setShow(true), 4000);
      return () => {
        clearTimeout(t);
        window.removeEventListener("beforeinstallprompt", onBeforeInstall);
        window.removeEventListener("appinstalled", onInstalled);
      };
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const remember = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      /* ignore */
    }
  };

  const dismiss = () => {
    remember();
    setShow(false);
    setShowIosHint(false);
  };

  const install = async () => {
    if (deferred) {
      try {
        await deferred.prompt();
        const choice = await deferred.userChoice;
        if (choice.outcome === "dismissed") remember();
      } catch {
        /* ignore */
      } finally {
        setDeferred(null);
        setShow(false);
      }
      return;
    }
    if (isIos()) {
      setShowIosHint(true);
    }
  };

  if (!show && !showIosHint) return null;

  if (showIosHint) {
    return (
      <div
        role="dialog"
        aria-modal="true"
        className="fixed inset-0 z-[10000] flex items-end justify-center bg-color-overlay p-4 sm:items-center"
        onClick={dismiss}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-md rounded-radius-xl bg-color-surface-raised p-5 text-color-text-main shadow-shadow-strong ring-1 ring-color-border-light animate-sheet-up sm:animate-scale-in"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1.25rem)" }}
        >
          <h2 className="mb-2 text-lg font-bold">Zum Home-Bildschirm hinzufügen</h2>
          <ol className="space-y-2 text-sm leading-relaxed text-color-text-secondary">
            <li>
              1. Tippen Sie in Safari auf das <strong>Teilen-Symbol</strong>{" "}
              <span aria-hidden="true">▢↑</span>.
            </li>
            <li>
              2. Wählen Sie <strong>„Zum Home-Bildschirm“</strong>.
            </li>
            <li>
              3. Tippen Sie rechts oben auf <strong>„Hinzufügen“</strong>.
            </li>
          </ol>
          <button
            type="button"
            onClick={dismiss}
            className="mt-5 h-11 w-full cursor-pointer rounded-radius-md bg-color-primary px-3 text-sm font-medium text-color-on-primary transition hover:bg-color-primary-dark active:scale-[0.98]"
          >
            Verstanden
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      role="dialog"
      aria-live="polite"
      className="fixed right-4 bottom-4 left-4 z-[9998] flex max-w-md flex-col gap-2 rounded-radius-lg bg-color-surface-raised p-4 text-color-text-main shadow-shadow-strong ring-1 ring-color-border-light animate-slide-up sm:left-auto"
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1rem)" }}
    >
      <p className="text-sm font-semibold">Payload Vault installieren</p>
      <p className="text-xs text-color-text-subtle">
        Schnellerer Zugriff direkt vom Home-Bildschirm.
      </p>
      <div className="mt-1 flex gap-2">
        <button
          type="button"
          onClick={install}
          className="h-8 cursor-pointer rounded-radius-md bg-color-primary px-3 text-xs font-medium text-color-on-primary transition hover:bg-color-primary-dark active:scale-95"
        >
          Installieren
        </button>
        <button
          type="button"
          onClick={dismiss}
          className="h-8 cursor-pointer rounded-radius-md border border-color-border-strong px-3 text-xs font-medium text-color-text-main transition hover:bg-color-bg-hover active:scale-95"
        >
          Nicht jetzt
        </button>
      </div>
    </div>
  );
};
