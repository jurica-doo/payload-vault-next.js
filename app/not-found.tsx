import Link from "next/link";

// Visible 404 instead of the old silent redirect to "/" — typo'd URLs
// shouldn't teleport the user without explanation.
export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-color-bg-main px-4 text-center">
      <div className="flex flex-col items-center gap-3 animate-scale-in">
        <span className="tabular bg-gradient-to-b from-color-primary-light to-color-primary bg-clip-text text-7xl font-semibold tracking-tight text-transparent">
          404
        </span>
        <h1 className="text-xl font-semibold text-color-text-main">
          Seite nicht gefunden
        </h1>
        <p className="max-w-sm text-sm text-color-text-subtle">
          Die angeforderte Seite existiert nicht oder wurde verschoben.
        </p>
        <Link
          href="/"
          className="mt-4 inline-flex h-10 items-center rounded-radius-md bg-color-primary px-4 text-sm font-medium text-color-on-primary no-underline transition hover:bg-color-primary-dark hover:no-underline active:scale-[0.97]"
        >
          Zur Übersicht
        </Link>
      </div>
    </main>
  );
}
