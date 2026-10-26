/**
 * CLI for golden-case parity (see goldenParity.ts).
 * Run with `npm run check:golden` (Node strips the TypeScript types itself).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { compareGoldenIds, extractGoldenIds } from "./goldenParity.mts";

const root = join(import.meta.dirname, "..");

function collect(dir: string, extensions: string[]): string {
  let text = "";
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return text;
  }
  for (const entry of entries) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      text += collect(path, extensions);
    } else if (extensions.some((ext) => entry.endsWith(ext))) {
      text += readFileSync(path, "utf8") + "\n";
    }
  }
  return text;
}

// TS side: only the domain test files (fixtures are referenced from there).
const tsIds = extractGoldenIds(collect(join(root, "src/domain"), [".test.ts"]));
const sqlIds = extractGoldenIds(collect(join(root, "supabase/tests"), [".test.sql"]));
const { onlyInTs, onlyInSql, shared } = compareGoldenIds(tsIds, sqlIds);

if (onlyInTs.length || onlyInSql.length) {
  if (onlyInTs.length) console.error(`Only in Vitest: ${onlyInTs.join(", ")}`);
  if (onlyInSql.length) console.error(`Only in pgTAP:  ${onlyInSql.join(", ")}`);
  process.exit(1);
}

console.log(`Golden parity OK (${shared} shared case IDs).`);
