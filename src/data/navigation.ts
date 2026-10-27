import type { ComponentType } from "react";
import type { IconProps } from "../components/icons/Icon.types";
import {
  ActivityIcon,
  AwardIcon,
  BriefcaseIcon,
  ChartBarIcon,
  ChecklistIcon,
  CoinsIcon,
  ContactIcon,
  FunnelIcon,
  GaugeIcon,
  HomeIcon,
  MailIcon,
  ReceiptIcon,
  SettingsIcon,
  ShieldIcon,
  TargetIcon,
  TrendIcon,
  UsersIcon,
  WalletIcon,
} from "../components/icons";
import type { Permissions } from "../hooks/permissions/permissions";
import { SALES_MODULES, type FeatureFlagKey, type SalesModule } from "./salesModules";
import { isKnownRoute, nearestParentRoute } from "./routes";

/**
 * Sidebar navigation, grouped so no group holds more than ~6 entries.
 * Sales entries reference a module key and are shown only when that module
 * is visible to the user (salesModules.ts stays the source of truth for
 * access). Sub-pages appear under their parent while it is active.
 */
export type NavItem = {
  label: string;
  href: string;
  icon?: ComponentType<IconProps>;
  module?: FeatureFlagKey;
  /** Only exact path matches count as active (e.g. "/" and "/admin"). */
  exact?: boolean;
  /** Extra visibility rule on top of the module check. */
  visible?: (p: Permissions) => boolean;
  children?: NavItem[];
};

export type NavGroup = { id: string; label: string; items: NavItem[] };

const moduleLabel = (key: FeatureFlagKey) =>
  SALES_MODULES.find((m) => m.key === key)?.label ?? key;

const staff = (p: Permissions) => p.isAdmin || p.isCompliance;

export const NAV_GROUPS: NavGroup[] = [
  {
    id: "vault",
    label: "Mein Tresor",
    items: [
      { label: "Übersicht", href: "/", icon: HomeIcon, exact: true },
      { label: "Einnahmen", href: "/einnahmen", icon: WalletIcon },
      {
        label: "Steuerrelevante Ausgaben",
        href: "/steuerrelevante-ausgaben",
        icon: ReceiptIcon,
      },
      { label: "Statistiken", href: "/statistiken", icon: ChartBarIcon },
      { label: "Analysen", href: "/analysen", icon: TrendIcon },
    ],
  },
  {
    id: "sales",
    label: "Vertrieb",
    items: [
      { label: "Cockpit", href: "/vertrieb", icon: GaugeIcon, module: "sales", exact: true },
      { label: moduleLabel("production"), href: "/vertrieb/produktion", icon: BriefcaseIcon, module: "production" },
      { label: moduleLabel("career"), href: "/vertrieb/karriere", icon: AwardIcon, module: "career" },
      { label: moduleLabel("team"), href: "/vertrieb/team", icon: UsersIcon, module: "team" },
      {
        label: moduleLabel("commission"),
        href: "/vertrieb/provisionen",
        icon: CoinsIcon,
        module: "commission",
        children: [
          {
            label: "Abrechnung",
            href: "/vertrieb/provisionen/abrechnung",
            visible: (p) => p.isFinance || p.isAdmin,
          },
        ],
      },
      { label: moduleLabel("goals"), href: "/vertrieb/ziele", icon: TargetIcon, module: "goals" },
    ],
  },
  {
    id: "crm",
    label: "Kunden & Leads",
    items: [
      {
        label: moduleLabel("leads"),
        href: "/vertrieb/leads",
        icon: FunnelIcon,
        module: "leads",
        children: [
          {
            label: "Auswertung",
            href: "/vertrieb/leads/analyse",
            visible: (p) => p.isLeader || p.isAdmin,
          },
        ],
      },
      {
        label: moduleLabel("tasks"),
        href: "/vertrieb/aufgaben",
        icon: ChecklistIcon,
        module: "tasks",
        children: [
          { label: "Aktivitäten & Termine", href: "/vertrieb/aufgaben/aktivitaeten" },
        ],
      },
      {
        label: moduleLabel("customers"),
        href: "/vertrieb/kunden",
        icon: ContactIcon,
        module: "customers",
        children: [
          { label: "Kommunikation", href: "/vertrieb/kunden/kommunikation", icon: MailIcon, visible: staff },
          { label: "Datenschutz", href: "/vertrieb/kunden/datenschutz", icon: ShieldIcon, visible: staff },
        ],
      },
    ],
  },
  {
    id: "admin",
    label: "Verwaltung",
    items: [
      { label: "Verwaltung", href: "/admin", icon: SettingsIcon, module: "admin", exact: true },
      { label: "Mitarbeitende", href: "/admin/mitarbeiter", icon: UsersIcon, module: "admin" },
      { label: "Hierarchie", href: "/admin/hierarchie", icon: ActivityIcon, module: "admin" },
      { label: "Regeln", href: "/admin/regeln", icon: ChecklistIcon, module: "admin" },
      { label: "Beförderungen", href: "/admin/befoerderungen", icon: AwardIcon, module: "admin" },
      { label: "Lead-Einstellungen", href: "/admin/leads", icon: FunnelIcon, module: "admin" },
    ],
  },
];

const isItemVisible = (
  item: NavItem,
  perms: Permissions,
  moduleKeys: Set<FeatureFlagKey>,
) =>
  (!item.module || moduleKeys.has(item.module)) &&
  (!item.visible || item.visible(perms));

/** The groups and items this user may see; empty groups are dropped. */
export function visibleNavigation(
  perms: Permissions,
  modules: SalesModule[],
): NavGroup[] {
  const keys = new Set(modules.map((m) => m.key));
  return NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items
      .filter((i) => isItemVisible(i, perms, keys))
      .map((i) => ({
        ...i,
        children: i.children?.filter((c) => isItemVisible(c, perms, keys)),
      })),
  })).filter((g) => g.items.length > 0);
}

const matches = (pathname: string, item: NavItem) =>
  item.exact
    ? pathname === item.href
    : pathname === item.href || pathname.startsWith(`${item.href}/`);

/**
 * The href of the most specific visible entry for this path, so
 * "/vertrieb/leads/analyse" highlights "Auswertung", not "Leads".
 */
export function activeNavHref(
  pathname: string,
  groups: NavGroup[],
): string | undefined {
  const all = groups.flatMap((g) =>
    g.items.flatMap((i) => [i, ...(i.children ?? [])]),
  );
  return all
    .filter((i) => matches(pathname, i))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
}

/**
 * Parent page for the top-bar back link on detail pages, if any. Only ever
 * returns a page that exists (see routes.ts): the most specific nav entry
 * above this path, else the nearest existing ancestor route.
 */
export function parentNavHref(
  pathname: string,
  groups: NavGroup[],
): string | undefined {
  const nav = activeNavHref(pathname, groups);
  const navParent = nav && nav !== pathname && isKnownRoute(nav) ? nav : undefined;
  const ancestor = nearestParentRoute(pathname);
  // The more specific of the two wins (/einnahmen/kategorie/adcuri/x goes
  // back to the Adcuri page, not to /einnahmen).
  if (navParent && ancestor) return ancestor.length > navParent.length ? ancestor : navParent;
  return navParent ?? ancestor;
}
