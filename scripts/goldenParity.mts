/**
 * Golden-case parity between the TypeScript preview engine and the SQL engine.
 *
 * Every calculation rule is tested twice: in Vitest against src/domain (the
 * live-preview mirror) and in pgTAP against the database (the authoritative
 * engine). Both sides tag each case with the same ID, e.g. `GC-POINTS-001`.
 * If an ID exists on only one side, the two engines are no longer proven to
 * agree on that case, and CI fails.
 */
export const GOLDEN_ID_PATTERN = /\bGC-[A-Z0-9]+-\d{3}\b/g;

export function extractGoldenIds(source: string): Set<string> {
  return new Set(source.match(GOLDEN_ID_PATTERN) ?? []);
}

export type ParityResult = {
  onlyInTs: string[];
  onlyInSql: string[];
  shared: number;
};

export function compareGoldenIds(ts: Set<string>, sql: Set<string>): ParityResult {
  const onlyInTs = [...ts].filter((id) => !sql.has(id)).sort();
  const onlyInSql = [...sql].filter((id) => !ts.has(id)).sort();
  const shared = [...ts].filter((id) => sql.has(id)).length;
  return { onlyInTs, onlyInSql, shared };
}
