"use client";

import { Button } from "../../components/button/Button";

export const OfflineView = () => {
  return (
    <div className="flex min-h-screen items-center justify-center bg-color-bg-main">
      <div className="ui-card m-4 flex max-w-md flex-col items-center justify-center p-8 text-center animate-scale-in">
        <svg
          className="mb-5 h-14 w-14 rounded-full bg-color-bg-alt p-3.5 text-color-text-subtle"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.75}
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3 3l18 18M8.5 16.5a5 5 0 0 1 7 0M5 12.55a11 11 0 0 1 5.17-2.39M10.71 5.05A16 16 0 0 1 22.58 9M1.42 9a15.91 15.91 0 0 1 4.7-2.88M12 20h.01"
          />
        </svg>
        <h1 className="mb-2 text-xl font-semibold text-color-text-main">Sie sind offline</h1>
        <p className="mb-6 text-sm text-color-text-subtle">
          Diese Seite ist ohne Internetverbindung nicht verfügbar. Bereits
          besuchte Seiten funktionieren weiterhin.
        </p>
        <Button
          text="Erneut versuchen"
          onClick={() => window.location.reload()}
        />
      </div>
    </div>
  );
};
