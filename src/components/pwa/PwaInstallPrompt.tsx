"use client";

import { type FocusEvent, useEffect, useRef, useState } from "react";
import { useAuth } from "../../context/AuthContext";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "pwa-install-dismissed-at";
const DISMISS_TTL_MS = 1000 * 60 * 60 * 24 * 14;
/** Login session the prompt was last shown in (user id + last sign-in). */
const SHOWN_KEY = "pwa-install-shown-session";
/** How long the prompt stays before it removes itself. */
const VISIBLE_MS = 10_000;
/** Let the app settle after login before anything slides in. */
const SHOW_DELAY_MS = 1500;
/** Length of .animate-slide-up-out (index.css). */
const EXIT_MS = 150;

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

const readKey = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const writeKey = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
};

/**
 * Install hint, at most once per login session (Chrome's own install button
 * is always there). It appears shortly after sign-in, stays 10 seconds with
 * an emptying bar, pauses while hovered or focused, then slides away until
 * the next login. "Nicht jetzt" silences it for 14 days.
 */
export const PwaInstallPrompt = () => {
  const { user } = useAuth();
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [phase, setPhase] = useState<"hidden" | "visible" | "leaving">("hidden");
  const [paused, setPaused] = useState(false);
  const [showIosHint, setShowIosHint] = useState(false);
  const remaining = useRef(VISIBLE_MS);
  const startedAt = useRef(0);

  // Chrome/Edge offer installation through this event; keep it for the button.
  useEffect(() => {
    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setDeferred(null);
      setPhase("hidden");
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const sessionId = user ? `${user.id}:${user.last_sign_in_at ?? ""}` : null;
  const canInstall = deferred !== null || isIos();

  useEffect(() => {
    if (!sessionId || !canInstall || isStandalone() || dismissedRecently()) return;
    if (readKey(SHOWN_KEY) === sessionId) return;
    const t = setTimeout(() => {
      // Counted as shown right away: a reload during the 10 s does not repeat it.
      writeKey(SHOWN_KEY, sessionId);
      remaining.current = VISIBLE_MS;
      setPhase("visible");
    }, SHOW_DELAY_MS);
    return () => clearTimeout(t);
  }, [sessionId, canInstall]);

  // Auto-dismiss; the remaining time survives pauses (hover/focus).
  useEffect(() => {
    if (phase !== "visible" || paused) return;
    startedAt.current = Date.now();
    const t = setTimeout(() => setPhase("leaving"), remaining.current);
    return () => {
      clearTimeout(t);
      remaining.current = Math.max(0, remaining.current - (Date.now() - startedAt.current));
    };
  }, [phase, paused]);

  // A timer, not animationend: hidden tabs and reduced motion still clean up.
  useEffect(() => {
    if (phase !== "leaving") return;
    const t = setTimeout(() => setPhase("hidden"), EXIT_MS);
    return () => clearTimeout(t);
  }, [phase]);

  const close = () => setPhase((p) => (p === "visible" ? "leaving" : p));

  const dismiss = () => {
    writeKey(DISMISS_KEY, String(Date.now()));
    close();
    setShowIosHint(false);
  };

  const install = async () => {
    if (deferred) {
      try {
        await deferred.prompt();
        const choice = await deferred.userChoice;
        if (choice.outcome === "dismissed") writeKey(DISMISS_KEY, String(Date.now()));
      } catch {
        /* ignore */
      } finally {
        setDeferred(null);
        close();
      }
      return;
    }
    if (isIos()) {
      close();
      setShowIosHint(true);
    }
  };

  const onBlur = (e: FocusEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget)) setPaused(false);
  };

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

  if (phase === "hidden") return null;

  return (
    <div
      role="dialog"
      aria-labelledby="pwa-install-title"
      aria-describedby="pwa-install-text"
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={onBlur}
      style={{ ["--countdown-ms" as string]: `${VISIBLE_MS}ms`, paddingBottom: "calc(env(safe-area-inset-bottom) + 1rem)" }}
      className={`fixed right-4 bottom-4 left-4 z-[9998] flex max-w-md flex-col gap-2 overflow-hidden rounded-radius-lg bg-color-surface-raised p-4 text-color-text-main shadow-shadow-strong ring-1 ring-color-border-light sm:left-auto ${
        phase === "leaving" ? "animate-slide-up-out" : "animate-slide-up"
      } ${paused ? "countdown-paused" : ""}`}
    >
      <p id="pwa-install-title" className="text-sm font-semibold">Payload Vault installieren</p>
      <p id="pwa-install-text" className="text-xs text-color-text-subtle">
        Schnellerer Zugriff direkt vom Home-Bildschirm.
        <span className="sr-only"> Der Hinweis schließt sich nach 10 Sekunden von selbst.</span>
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
      {/* Time left until the hint removes itself; stops while hovered/focused. */}
      <div aria-hidden className="absolute inset-x-0 bottom-0 h-1 bg-color-border-light">
        <div className="countdown-bar h-full bg-color-primary" />
      </div>
    </div>
  );
};
