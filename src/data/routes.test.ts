import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { isKnownRoute, nearestParentRoute, ROUTE_PATTERNS } from "./routes";
import { NAV_GROUPS, parentNavHref, type NavGroup } from "./navigation";
import { pageMetaFor } from "./pageMeta";

const root = join(__dirname, "..", "..");

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });

/** app/**\/page.tsx → route pattern; route groups "(x)" don't add a segment. */
const appRoutes = () =>
  walk(join(root, "app"))
    .filter((f) => f.endsWith("/page.tsx"))
    .map((f) => {
      const segs = relative(join(root, "app"), f).split("/").slice(0, -1);
      return "/" + segs.filter((s) => !s.startsWith("(")).join("/");
    })
    .sort();

const sample = (pattern: string) => pattern.replace(/\[[^\]]+\]/g, "11111111-1111-4111-8111-111111111111");

const allNav: NavGroup[] = NAV_GROUPS;

describe("route registry", () => {
  it("matches the pages in app/", () => {
    expect([...ROUTE_PATTERNS].sort()).toEqual(appRoutes());
  });

  it("knows dynamic segments and rejects missing parents", () => {
    expect(isKnownRoute("/vertrieb/leads/abc")).toBe(true);
    expect(isKnownRoute("/profil")).toBe(false);
    expect(isKnownRoute("/einnahmen/kategorie")).toBe(false);
    expect(nearestParentRoute("/profil/sicherheit")).toBeUndefined();
    expect(nearestParentRoute("/einnahmen/kategorie/adcuri/bestand")).toBe("/einnahmen/kategorie/adcuri");
  });
});

describe("links only point at existing pages", () => {
  it("every navigation entry", () => {
    const hrefs = NAV_GROUPS.flatMap((g) => g.items.flatMap((i) => [i.href, ...(i.children ?? []).map((c) => c.href)]));
    expect(hrefs.filter((h) => !isKnownRoute(h))).toEqual([]);
  });

  it("every breadcrumb", () => {
    const bad = ROUTE_PATTERNS.flatMap((p) =>
      (pageMetaFor(sample(p))?.breadcrumbs ?? []).filter((c) => c.href && !isKnownRoute(c.href)).map((c) => `${p} → ${c.href}`),
    );
    expect(bad).toEqual([]);
  });

  it("every back link", () => {
    const bad = ROUTE_PATTERNS.map(sample)
      .map((p) => [p, parentNavHref(p, allNav)] as const)
      .filter(([, back]) => back !== undefined && !isKnownRoute(back));
    expect(bad).toEqual([]);
  });

  it("the back link from the security page (regression: led to /profil)", () => {
    expect(parentNavHref("/profil/sicherheit", allNav)).toBeUndefined();
    expect(parentNavHref("/vertrieb/leads/analyse", allNav)).toBe("/vertrieb/leads");
    expect(parentNavHref("/einnahmen/kategorie/adcuri", allNav)).toBe("/einnahmen");
  });

  it("every literal internal href / router.push in the source", () => {
    const files = walk(join(root, "src")).filter((f) => /\.tsx?$/.test(f) && !f.includes(".test."));
    const bad: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      for (const m of src.matchAll(/(?:href=|href:\s*|push\(|replace\()\s*\{?\s*["`](\/[^"`?#]*)["`]/g)) {
        const path = m[1].replace(/\$\{[^}]+\}/g, "x");
        if (!path.startsWith("//") && !isKnownRoute(path) && !/^\/(favicon|profina|splash|pwa|apple|Desktop)/.test(path))
          bad.push(`${relative(root, f)}: ${m[1]}`);
      }
    }
    expect(bad).toEqual([]);
  });
});
