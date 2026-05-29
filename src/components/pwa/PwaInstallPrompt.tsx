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
        className="fixed inset-0 z-[10000] flex items-end justify-center bg-black/60 p-4 sm:items-center"
        onClick={dismiss}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-md rounded-2xl border border-[#00c4b3]/30 bg-[#0d0d0d] p-5 text-white shadow-2xl"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1.25rem)" }}
        >
          <h2 className="mb-2 text-lg font-bold">Zum Home-Bildschirm hinzufügen</h2>
          <ol className="space-y-2 text-sm leading-relaxed opacity-90">
            <li>
              1. Tippe in Safari auf das <strong>Teilen-Symbol</strong>{" "}
              <span aria-hidden="true">▢↑</span>.
            </li>
            <li>
              2. Wähle <strong>„Zum Home-Bildschirm“</strong>.
            </li>
            <li>
              3. Tippe rechts oben auf <strong>„Hinzufügen“</strong>.
            </li>
          </ol>
          <button
            type="button"
            onClick={dismiss}
            className="mt-5 w-full cursor-pointer rounded-md bg-[#00c4b3] px-3 py-2 text-sm font-semibold text-black transition hover:bg-[#33d1c2] active:scale-95"
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
      className="fixed right-4 bottom-4 left-4 z-[9998] flex max-w-md flex-col gap-2 rounded-xl border border-[#00c4b3]/40 bg-[#0d0d0d]/95 p-4 text-white shadow-2xl backdrop-blur-md sm:left-auto"
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1rem)" }}
    >
      <p className="text-sm font-semibold">Payload Vault installieren</p>
      <p className="text-xs opacity-80">
        Schnellerer Zugriff direkt vom Home-Bildschirm.
      </p>
      <div className="mt-1 flex gap-2">
        <button
          type="button"
          onClick={install}
          className="cursor-pointer rounded-md bg-[#00c4b3] px-3 py-1.5 text-xs font-semibold text-black transition hover:bg-[#33d1c2] active:scale-95"
        >
          Installieren
        </button>
        <button
          type="button"
          onClick={dismiss}
          className="cursor-pointer rounded-md border border-white/20 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-white/10 active:scale-95"
        >
          Nicht jetzt
        </button>
      </div>
    </div>
  );
};
