"use client";

import Link from "next/link";
import * as CookieConsent from "vanilla-cookieconsent";

const linkClass =
  "py-1 text-xs text-color-text-subtle no-underline transition-colors duration-150 hover:text-color-text-main hover:no-underline";

export const MiniFooter = () => {
  return (
    <footer className="w-full border-t border-color-border-light px-4 py-4 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-2 text-xs text-color-text-subtle sm:flex-row sm:items-center">
        <span>© {new Date().getFullYear()} Profina · Payload Vault</span>
        <nav aria-label="Rechtliches" className="flex flex-wrap items-center gap-x-5 gap-y-1">
          <Link href="/impressum" className={linkClass}>
            Impressum
          </Link>
          <Link href="/datenschutz" className={linkClass}>
            Datenschutzerklärung
          </Link>
          <button
            type="button"
            onClick={() => CookieConsent.showPreferences()}
            className={`${linkClass} cursor-pointer`}
          >
            Cookie-Einstellungen
          </button>
        </nav>
      </div>
    </footer>
  );
};
