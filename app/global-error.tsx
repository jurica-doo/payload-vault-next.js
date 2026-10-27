"use client";

import "./globals.css";

// Last-resort boundary for errors in the root layout itself; it replaces the
// whole document, so it brings its own <html> and keeps to plain markup.
export default function GlobalError({
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <html lang="de">
      <body>
        <main className="flex min-h-screen items-center justify-center bg-color-bg-main p-4">
          <div className="ui-card flex max-w-md flex-col items-center gap-3 p-8 text-center">
            <h1 className="text-lg font-semibold text-color-text-main">
              Die Anwendung konnte nicht geladen werden
            </h1>
            <p className="text-sm text-color-text-subtle">
              Bitte laden Sie die Seite neu. Besteht das Problem weiter,
              wenden Sie sich an die Verwaltung.
            </p>
            <button
              type="button"
              onClick={() => unstable_retry()}
              className="mt-3 h-10 cursor-pointer rounded-radius-md bg-color-primary px-4 text-sm font-medium text-color-on-primary transition hover:bg-color-primary-dark active:scale-[0.97]"
            >
              Erneut versuchen
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
