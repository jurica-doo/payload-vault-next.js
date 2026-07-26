"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { EmptyState } from "../../components/emptyState/EmptyState";

/**
 * Shown when a /kategorie/... URL doesn't match any known category slug.
 * Replaces the old bare <h1>Kategorie nicht gefunden</h1>.
 */
export const CategoryNotFound = ({ slug }: { slug?: string }) => {
  const pathname = usePathname();
  const backHref = pathname.includes("/steuerrelevante-ausgaben")
    ? "/steuerrelevante-ausgaben"
    : "/einnahmen";

  return (
    <main className="flex flex-col mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:px-8 gap-6 pb-6">
      <EmptyState
        message="Kategorie nicht gefunden"
        hint={slug ? `„${slug}" ist keine bekannte Kategorie.` : undefined}
      />
      <Link
        href={backHref}
        className="mx-auto text-color-primary font-semibold no-underline hover:underline"
      >
        Zurück zur Übersicht
      </Link>
    </main>
  );
};
