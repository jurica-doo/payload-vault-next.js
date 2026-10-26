/**
 * Single source of truth for the sales-system modules: navigation, the sales
 * layout, page titles and access checks all read from here.
 *
 * `flag` matches a key in app_settings.feature_flags (migration
 * 20261026130000). A module is visible when the `sales` master flag and its
 * own flag are on AND the user meets `audience`.
 */
export type FeatureFlagKey =
  | "sales"
  | "production"
  | "career"
  | "team"
  | "commission"
  | "goals"
  | "leads"
  | "customers"
  | "tasks"
  | "admin";

export type Audience =
  | "employee" // any active employee
  | "leader" // has at least one descendant in the hierarchy
  | "admin"
  | "finance";

export type SalesModule = {
  key: FeatureFlagKey;
  label: string;
  href: string;
  audience: Audience[]; // any of these
  /** Plan phase that builds the module; shown on placeholders. */
  phase: number;
  description: string;
};

export const SALES_MODULES: SalesModule[] = [
  {
    key: "sales",
    label: "Vertrieb",
    href: "/vertrieb",
    audience: ["employee"],
    phase: 3,
    description: "Persönliches Dashboard mit Punkten, Zielen und Aufgaben.",
  },
  {
    key: "production",
    label: "Produktion",
    href: "/vertrieb/produktion",
    audience: ["employee"],
    phase: 1,
    description: "Verträge erfassen und importieren, Punkte und AE nachvollziehen.",
  },
  {
    key: "career",
    label: "Karriere",
    href: "/vertrieb/karriere",
    audience: ["employee"],
    phase: 1,
    description: "Fortschritt zur nächsten Stufe inklusive KV-Anteil und Strukturgrenze.",
  },
  {
    key: "team",
    label: "Team",
    href: "/vertrieb/team",
    audience: ["leader", "admin"],
    phase: 1,
    description: "Direkte und indirekte Struktur.",
  },
  {
    key: "commission",
    label: "Provisionen",
    href: "/vertrieb/provisionen",
    audience: ["employee", "finance"],
    phase: 2,
    description: "Provisionen, Reserve und Zuschüsse.",
  },
  {
    key: "goals",
    label: "Ziele",
    href: "/vertrieb/ziele",
    audience: ["employee"],
    phase: 3,
    description: "Monatsziele einreichen und freigeben.",
  },
  {
    key: "leads",
    label: "Leads",
    href: "/vertrieb/leads",
    audience: ["employee"],
    phase: 4,
    description: "Leads zuweisen und durch die Pipeline führen.",
  },
  {
    key: "tasks",
    label: "Aufgaben",
    href: "/vertrieb/aufgaben",
    audience: ["employee"],
    phase: 4,
    description: "Aufgaben, Erinnerungen und Benachrichtigungen.",
  },
  {
    key: "customers",
    label: "Kunden",
    href: "/vertrieb/kunden",
    audience: ["employee"],
    phase: 5,
    description: "Kundenübersicht und Betreuungshistorie.",
  },
  {
    key: "admin",
    label: "Verwaltung",
    href: "/admin",
    audience: ["admin"],
    phase: 1,
    description: "Mitarbeitende, Regeln, Struktur und Prüfwarteschlange.",
  },
];

/**
 * The module a path belongs to: the one with the longest matching href, so
 * /vertrieb/produktion maps to "production" and not to "sales".
 */
export function moduleForPath(pathname: string): SalesModule | undefined {
  return SALES_MODULES.filter(
    (m) => pathname === m.href || pathname.startsWith(`${m.href}/`),
  ).sort((a, b) => b.href.length - a.href.length)[0];
}
