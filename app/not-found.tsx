import Link from "next/link";

// Visible 404 instead of the old silent redirect to "/" — typo'd URLs
// shouldn't teleport the user without explanation.
export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-color-bg-main px-4 text-center">
      <h1 className="text-5xl font-bold text-color-primary">404</h1>
      <p className="text-color-text-main text-lg font-medium">
        Seite nicht gefunden
      </p>
      <p className="text-color-text-secondary text-sm max-w-md">
        Die angeforderte Seite existiert nicht oder wurde verschoben.
      </p>
      <Link
        href="/"
        className="mt-2 rounded-radius-md bg-color-primary px-5 py-2.5 font-semibold text-black no-underline transition hover:opacity-90 active:scale-95"
      >
        Zur Startseite
      </Link>
    </main>
  );
}
