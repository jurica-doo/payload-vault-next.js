// Read-only checks against the local database (psql inside the Supabase
// container; psql is not installed on the host).
import { execFileSync } from "node:child_process";

const CONTAINER = process.env.E2E_DB_CONTAINER ?? "supabase_db_payload-vault";

export function sql(query: string): string {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTAINER, "psql", "-U", "postgres", "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1"],
    { input: query, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
  ).trim();
}

/** Rows of a SELECT as objects. */
export function sqlJson<T>(query: string): T[] {
  const out = sql(`select coalesce(json_agg(t), '[]'::json) from (${query}) t;`);
  return JSON.parse(out) as T[];
}
