import type { ReactNode } from "react";
import { MiniFooter } from "../footer/MiniFooter";
import { CheckIcon, ShieldIcon } from "../icons";

type AuthLayoutProps = {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  /** Small print under the form (links back, help). */
  footer?: ReactNode;
};

const TRUST_POINTS = [
  "Belege, Einnahmen und Ausgaben an einem Ort",
  "Vertrieb, Karriere und Provisionen transparent",
  "Daten in der EU, Zugriff nur für Berechtigte",
];

/**
 * Shell for login, password reset and invite pages: brand panel on large
 * screens, a single focused card everywhere else.
 */
export const AuthLayout = ({
  title,
  description,
  children,
  footer,
}: AuthLayoutProps) => (
  <div className="flex min-h-screen flex-col bg-color-bg-main lg:flex-row">
    <aside className="auth-bg relative hidden flex-col justify-between overflow-hidden p-10 lg:flex lg:w-[44%] xl:p-14">
      <div className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/profinaLogo.svg" alt="Profina" className="theme-logo-dark w-36" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/profinaLogoLight.svg" alt="Profina" className="theme-logo-light w-36" />
      </div>
      <div className="flex max-w-md flex-col gap-6 animate-slide-up">
        <h2 className="text-3xl font-semibold leading-tight tracking-tight text-color-text-main xl:text-[2.25rem]">
          Ihr digitaler Tresor für Vertrieb und Finanzen.
        </h2>
        <ul className="flex flex-col gap-3">
          {TRUST_POINTS.map((t) => (
            <li key={t} className="flex items-center gap-3 text-[0.9375rem] text-color-text-secondary">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-color-primary/15 text-color-text-accent">
                <CheckIcon size={14} />
              </span>
              {t}
            </li>
          ))}
        </ul>
      </div>
      <p className="flex items-center gap-2 text-xs text-color-text-subtle">
        <ShieldIcon size={14} />
        Verschlüsselte Verbindung · Zwei-Faktor-Anmeldung verfügbar
      </p>
    </aside>

    <div className="flex flex-1 flex-col">
      <main className="flex flex-1 items-center justify-center px-4 py-10 sm:px-6">
        <div className="w-full max-w-[25rem] animate-scale-in">
          <div className="mb-8 flex justify-center lg:hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/profinaLogo.svg" alt="Profina" className="theme-logo-dark w-32" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/profinaLogoLight.svg" alt="Profina" className="theme-logo-light w-32" />
          </div>
          <div className="ui-card p-6 sm:p-8">
            <div className="mb-6 flex flex-col gap-1.5">
              <h1 className="text-[1.375rem] font-semibold tracking-tight text-color-text-main">
                {title}
              </h1>
              {description && (
                <p className="text-sm text-color-text-subtle">{description}</p>
              )}
            </div>
            {children}
          </div>
          {footer && (
            <div className="mt-6 flex flex-col items-center gap-2 text-center text-sm text-color-text-subtle">
              {footer}
            </div>
          )}
        </div>
      </main>
      <MiniFooter />
    </div>
  </div>
);

/** Success state inside an AuthLayout card (mail sent, password changed). */
export const AuthResult = ({
  children,
  action,
}: {
  children: ReactNode;
  action?: ReactNode;
}) => (
  <div className="flex flex-col items-center gap-5 text-center">
    <span className="flex h-14 w-14 items-center justify-center rounded-full bg-color-success/12 text-color-success-text animate-pop-in">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="m5 12 5 5 9-10" className="animate-draw-check" />
      </svg>
    </span>
    <div className="text-sm text-color-text-subtle">{children}</div>
    {action && <div className="w-full">{action}</div>}
  </div>
);
