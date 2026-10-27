/**
 * Every page route of the app (mirrors app/**\/page.tsx; routes.test.ts
 * keeps the two in sync). Used to make sure computed links — back buttons,
 * breadcrumbs — only ever point at pages that exist.
 */
export const ROUTE_PATTERNS = [
  "/",
  "/admin",
  "/admin/befoerderungen",
  "/admin/hierarchie",
  "/admin/leads",
  "/admin/mitarbeiter",
  "/admin/regeln",
  "/analysen",
  "/datenschutz",
  "/dev/ui",
  "/einnahmen",
  "/einnahmen/alle-dokumente",
  "/einnahmen/kategorie/[slug]",
  "/einnahmen/kategorie/[slug]/[subSlug]",
  "/impressum",
  "/login",
  "/offline",
  "/passwort-zurucksetzen",
  "/profil/sicherheit",
  "/signup",
  "/statistiken",
  "/steuerrelevante-ausgaben",
  "/steuerrelevante-ausgaben/alle-dokumente",
  "/steuerrelevante-ausgaben/kategorie/[slug]",
  "/update-passwort",
  "/vertrieb",
  "/vertrieb/aufgaben",
  "/vertrieb/aufgaben/aktivitaeten",
  "/vertrieb/karriere",
  "/vertrieb/kunden",
  "/vertrieb/kunden/[id]",
  "/vertrieb/kunden/datenschutz",
  "/vertrieb/kunden/kommunikation",
  "/vertrieb/leads",
  "/vertrieb/leads/[id]",
  "/vertrieb/leads/analyse",
  "/vertrieb/produktion",
  "/vertrieb/produktion/import",
  "/vertrieb/provisionen",
  "/vertrieb/provisionen/abrechnung",
  "/vertrieb/team",
  "/vertrieb/team/[id]",
  "/vertrieb/ziele",
] as const;

const segments = (path: string) => path.split("/").filter(Boolean);

const PATTERNS = ROUTE_PATTERNS.map(segments);

/** True when `path` (without query/hash) is served by a page. */
export function isKnownRoute(path: string): boolean {
  const parts = segments(path.split(/[?#]/)[0]);
  return PATTERNS.some(
    (p) =>
      p.length === parts.length &&
      p.every((seg, i) => seg.startsWith("[") || seg === parts[i]),
  );
}

/**
 * Closest existing ancestor page of `path`, excluding the start page:
 * /einnahmen/kategorie/adcuri/x → /einnahmen/kategorie/adcuri,
 * /profil/sicherheit → undefined (no /profil page).
 */
export function nearestParentRoute(path: string): string | undefined {
  const parts = segments(path.split(/[?#]/)[0]);
  for (let n = parts.length - 1; n >= 1; n--) {
    const candidate = `/${parts.slice(0, n).join("/")}`;
    if (isKnownRoute(candidate)) return candidate;
  }
  return undefined;
}
