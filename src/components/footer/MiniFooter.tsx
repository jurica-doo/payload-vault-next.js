"use client";

import Link from "next/link";
import * as CookieConsent from "vanilla-cookieconsent";

export const MiniFooter = () => {
  return (
    <footer className="w-full py-3 px-4 text-center border-t border-color-border-light/50 bg-color-bg-main/80 backdrop-blur-sm">
      <div className="flex flex-col items-start md:items-center gap-1 text-xs text-color-text-subtle">
        <div className="flex flex-col sm:flex-row items-start md:items-center gap-x-4 gap-y-1">
          <Link
            href="/impressum"
            className="hover:text-color-primary transition-colors duration-200 hover:underline py-1 text-xs text-color-text-subtle"
          >
            Impressum
          </Link>
          <span className="hidden sm:inline text-color-border-light">·</span>
          <Link
            href="/datenschutz"
            className="hover:text-color-primary transition-colors duration-200 hover:underline py-1 text-xs text-color-text-subtle"
          >
            Datenschutzerklärung
          </Link>
          <span className="hidden sm:inline text-color-border-light">·</span>
          <button
            type="button"
            onClick={() => CookieConsent.showPreferences()}
            className="hover:text-color-primary transition-colors duration-200 hover:underline py-1 text-xs text-color-text-subtle"
          >
            Cookie-Einstellungen
          </button>
        </div>
      </div>
    </footer>
  );
};
