/**
 * Full-screen branded loading state (auth/session bootstrap).
 * Replaces the bare "Laden..." text: Profina logo with a soft pulse and a
 * spinning primary-colored ring. Theme-aware via the .theme-logo-* helpers.
 */
export const LoadingScreen = () => {
  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center gap-8 bg-color-bg-main"
      role="status"
      aria-live="polite"
      aria-label="Laden"
    >
      <div className="animate-pulse">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/profinaLogo.svg"
          alt="Profina"
          className="theme-logo-dark w-40 sm:w-48"
        />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/profinaLogoLight.svg"
          alt="Profina"
          className="theme-logo-light w-40 sm:w-48"
        />
      </div>

      <div className="flex items-center gap-1.5" aria-hidden="true">
        <span className="loading-dot h-2 w-2 rounded-full bg-color-primary" />
        <span className="loading-dot h-2 w-2 rounded-full bg-color-primary" />
        <span className="loading-dot h-2 w-2 rounded-full bg-color-primary" />
      </div>
    </div>
  );
};
