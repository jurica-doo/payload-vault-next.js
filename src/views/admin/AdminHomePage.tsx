"use client";

import { LinkCard } from "../../components/linkCard/LinkCard";
import {
  ActivityIcon,
  AwardIcon,
  ChecklistIcon,
  FunnelIcon,
  UsersIcon,
} from "../../components/icons";
import { MfaRequiredNotice } from "../../components/mfa/MfaRequiredNotice";
import { usePermissions } from "../../hooks/permissions/usePermissions";

/** Admin areas; later slices add Struktur, Regeln, Prüfwarteschlange, … */
const AREAS = [
  {
    href: "/admin/mitarbeiter",
    icon: UsersIcon,
    title: "Mitarbeitende",
    description: "Anlegen, einladen, deaktivieren und Rollen vergeben.",
  },
  {
    href: "/admin/hierarchie",
    icon: ActivityIcon,
    title: "Struktur",
    description: "Führungskräfte zuordnen und Wechsel mit Stichtag planen.",
  },
  {
    href: "/admin/regeln",
    icon: ChecklistIcon,
    title: "Regeln",
    description: "Karrierestufen, Sätze und Punkteumrechnung – versioniert mit Stichtag.",
  },
  {
    href: "/admin/befoerderungen",
    icon: AwardIcon,
    title: "Beförderungen",
    description: "Qualifizierte Mitarbeitende prüfen und befördern.",
  },
  {
    href: "/admin/leads",
    icon: FunnelIcon,
    title: "Leads",
    description: "Phasen, Pflichtfelder, Quellen und Kosten, Erstkontakt-Frist und Feiertage.",
  },
];

export const AdminHomePage = () => {
  const { permissions } = usePermissions();

  return (
    <div className="flex flex-col gap-4">
      {!permissions.hasMfa && <MfaRequiredNotice />}
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 stagger">
        {AREAS.map((area) => (
          <li key={area.href} className="flex">
            <div className="flex-1 [&>a]:h-full">
              <LinkCard href={area.href} icon={area.icon} title={area.title} description={area.description} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
};
