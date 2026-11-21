import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronLeftIcon } from "../../components/icons";
import { MiniFooter } from "../../components/footer/MiniFooter";
import { LEGAL, LEGAL_FIELD_LABEL, type LegalEntity } from "../../data/legalEntity";

/** Shared frame of the legal pages (Impressum, Datenschutz). */
export const LegalPage = ({ title, children }: { title: string; children: ReactNode }) => (
  <div className="flex min-h-screen flex-col">
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 animate-fade-in sm:px-6 lg:px-8">
      <div className="ui-card p-6 sm:p-10">
        <Link
          href="/"
          className="mb-8 inline-flex items-center gap-2 rounded-radius-md py-2 text-sm font-medium text-color-text-subtle no-underline transition-colors hover:text-color-text-main hover:no-underline"
        >
          <ChevronLeftIcon size={16} />
          <span>Zurück zur Übersicht</span>
        </Link>
        <h1 className="mb-8 text-color-text-main">{title}</h1>
        <div className="flex flex-col gap-8 text-sm leading-relaxed text-color-text-secondary sm:text-base">{children}</div>
      </div>
    </main>
    <MiniFooter />
  </div>
);

export const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="flex flex-col gap-2">
    <h2 className="mb-1 text-lg font-semibold text-color-text-main">{title}</h2>
    {children}
  </section>
);

/** A value of the operator data, or a visible marker while it is still missing. */
export const V = ({ k }: { k: keyof LegalEntity }) => {
  const value = LEGAL[k];
  if (value != null) return <>{value}</>;
  return (
    <span className="rounded-sm bg-color-bg-warning-subtle px-1 text-color-warning-text" data-legal-open={k}>
      [noch offen: {LEGAL_FIELD_LABEL[k]}]
    </span>
  );
};

export const Address = () => (
  <p>
    <V k="operator" />
    <br />
    <V k="trade" />
    <br />
    <V k="street" />
    <br />
    <V k="postalCity" />
    <br />
    <V k="country" />
  </p>
);
