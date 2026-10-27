import type { Crumb } from "../components/pageHeader/PageHeader";

/**
 * Title, description and breadcrumbs for the sales and admin routes. The
 * sales shell renders the page header from here, so every page introduces
 * itself the same way. Detail routes (with an id) only get breadcrumbs —
 * the view renders the record's own name as the heading.
 */
export type PageMeta = {
  title?: string;
  description?: string;
  breadcrumbs?: Crumb[];
};

const LEADS: Crumb = { label: "Leads", href: "/vertrieb/leads" };
const TASKS: Crumb = { label: "Aufgaben", href: "/vertrieb/aufgaben" };
const CUSTOMERS: Crumb = { label: "Kunden", href: "/vertrieb/kunden" };
const ADMIN: Crumb = { label: "Verwaltung", href: "/admin" };

const STATIC: Record<string, PageMeta> = {
  "/vertrieb": {
    title: "Cockpit",
    description: "Ihr Monat auf einen Blick: Punkte, Ziele, Aufgaben und Team.",
  },
  "/vertrieb/produktion": {
    title: "Produktion",
    description: "Verträge erfassen, einreichen und Punkte nachvollziehen.",
  },
  "/vertrieb/produktion/import": {
    title: "CSV-Import",
    description: "Produktion aus einer Gesellschafts-Datei prüfen und übernehmen.",
    breadcrumbs: [{ label: "Produktion", href: "/vertrieb/produktion" }, { label: "CSV-Import" }],
  },
  "/vertrieb/karriere": {
    title: "Karriere",
    description: "Fortschritt zur nächsten Stufe inklusive KV-Anteil und Strukturgrenze.",
  },
  "/vertrieb/team": {
    title: "Team",
    description: "Direkte und indirekte Struktur mit Kennzahlen je Person.",
  },
  "/vertrieb/provisionen": {
    title: "Provisionen",
    description: "Provisionen, Reserve und Zuschüsse je Abrechnungsmonat.",
  },
  "/vertrieb/provisionen/abrechnung": {
    title: "Abrechnung",
    description: "Monatsabschluss, Zuschüsse und Prüffälle für die Finanzabteilung.",
    breadcrumbs: [{ label: "Provisionen", href: "/vertrieb/provisionen" }, { label: "Abrechnung" }],
  },
  "/vertrieb/ziele": {
    title: "Ziele",
    description: "Monatsziele planen, einreichen und freigeben.",
  },
  "/vertrieb/leads": {
    title: "Leads",
    description: "Neue Kontakte zuweisen und durch die Pipeline führen.",
  },
  "/vertrieb/leads/analyse": {
    title: "Lead-Auswertung",
    description: "Funnel, Erstkontakt-Zeiten, Quellen und Verlustgründe.",
    breadcrumbs: [LEADS, { label: "Auswertung" }],
  },
  "/vertrieb/aufgaben": {
    title: "Aufgaben",
    description: "Offene, überfällige und erledigte Aufgaben.",
  },
  "/vertrieb/aufgaben/aktivitaeten": {
    title: "Aktivitäten & Termine",
    description: "Anrufe, Termine und Gespräche erfassen und auswerten.",
    breadcrumbs: [TASKS, { label: "Aktivitäten & Termine" }],
  },
  "/vertrieb/kunden": {
    title: "Kunden",
    description: "Kundenübersicht, Verträge und Betreuungshistorie.",
  },
  "/vertrieb/kunden/kommunikation": {
    title: "Kommunikation",
    description: "Vorlagen, Kampagnen, Versandfenster und Sperrliste.",
    breadcrumbs: [CUSTOMERS, { label: "Kommunikation" }],
  },
  "/vertrieb/kunden/datenschutz": {
    title: "Datenschutz",
    description: "Betroffenenanfragen, Einwilligungen, Aufbewahrung und Exporte.",
    breadcrumbs: [CUSTOMERS, { label: "Datenschutz" }],
  },
  "/admin": {
    title: "Verwaltung",
    description: "Mitarbeitende, Struktur, Regeln und Prüfwarteschlangen.",
  },
  "/admin/mitarbeiter": {
    title: "Mitarbeitende",
    description: "Konten anlegen, einladen, Rollen und Stufen pflegen.",
    breadcrumbs: [ADMIN, { label: "Mitarbeitende" }],
  },
  "/admin/hierarchie": {
    title: "Hierarchie",
    description: "Zuordnungen zur Führungskraft mit Gültigkeitszeitraum.",
    breadcrumbs: [ADMIN, { label: "Hierarchie" }],
  },
  "/admin/regeln": {
    title: "Regeln",
    description: "Versionierte Punkte- und Provisionsregeln.",
    breadcrumbs: [ADMIN, { label: "Regeln" }],
  },
  "/admin/befoerderungen": {
    title: "Beförderungen",
    description: "Anstehende Stufenwechsel prüfen und freigeben.",
    breadcrumbs: [ADMIN, { label: "Beförderungen" }],
  },
  "/admin/leads": {
    title: "Lead-Einstellungen",
    description: "Erstkontakt-Frist, Pflichtfelder, Quellen, Feiertage und Verteilung.",
    breadcrumbs: [ADMIN, { label: "Lead-Einstellungen" }],
  },
};

const DETAIL: { prefix: string; meta: PageMeta }[] = [
  { prefix: "/vertrieb/leads/", meta: { breadcrumbs: [LEADS, { label: "Lead" }] } },
  { prefix: "/vertrieb/kunden/", meta: { breadcrumbs: [CUSTOMERS, { label: "Kunde" }] } },
  {
    prefix: "/vertrieb/team/",
    meta: { breadcrumbs: [{ label: "Team", href: "/vertrieb/team" }, { label: "Profil & Coaching" }] },
  },
];

export function pageMetaFor(pathname: string): PageMeta | undefined {
  const path = pathname.replace(/\/$/, "") || "/";
  return STATIC[path] ?? DETAIL.find((d) => path.startsWith(d.prefix))?.meta;
}
