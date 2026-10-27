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
    <div className="flex flex-col gap-6">
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
    </div>
  );
};
