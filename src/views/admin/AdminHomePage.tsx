"use client";

import Link from "next/link";
import { MfaRequiredNotice } from "../../components/mfa/MfaRequiredNotice";
import { usePermissions } from "../../hooks/permissions/usePermissions";

/** Admin areas; later slices add Struktur, Regeln, Prüfwarteschlange, … */
const AREAS = [
  {
    href: "/admin/mitarbeiter",
    title: "Mitarbeitende",
    description: "Anlegen, einladen, deaktivieren und Rollen vergeben.",
  },
  {
    href: "/admin/hierarchie",
    title: "Struktur",
    description: "Führungskräfte zuordnen und Wechsel mit Stichtag planen.",
  },
  {
    href: "/admin/regeln",
    title: "Regeln",
    description: "Karrierestufen, Sätze und Punkteumrechnung – versioniert mit Stichtag.",
  },
  {
    href: "/admin/befoerderungen",
    title: "Beförderungen",
    description: "Qualifizierte Mitarbeitende prüfen und befördern.",
  },
];

export const AdminHomePage = () => {
  const { permissions } = usePermissions();

  return (
    <div className="flex flex-col gap-4">
      {!permissions.hasMfa && <MfaRequiredNotice />}
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {AREAS.map((area) => (
          <li key={area.href}>
            <Link
              href={area.href}
              className="flex h-full flex-col gap-1 rounded-radius-lg bg-color-bg-card p-4 no-underline shadow-shadow-soft transition-all duration-200 hover:no-underline hover:shadow-shadow-medium"
            >
              <span className="text-base font-semibold text-color-text-main">{area.title}</span>
              <span className="text-sm text-color-text-subtle">{area.description}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
};
