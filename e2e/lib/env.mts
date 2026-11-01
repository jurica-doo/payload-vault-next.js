// Local Supabase connection details, read from the running stack
// (`supabase status -o env`), so nothing secret is stored in the repo.
import { execFileSync } from "node:child_process";

export type SupabaseEnv = { apiUrl: string; anonKey: string; serviceRoleKey: string };

let cached: SupabaseEnv | undefined;

export function supabaseEnv(): SupabaseEnv {
  if (cached) return cached;
  let out: string;
  try {
    out = execFileSync("supabase", ["status", "-o", "env"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    throw new Error("`supabase status` failed. Start the local stack first: supabase start");
  }
  const get = (key: string) => out.match(new RegExp(`^${key}="?([^"\\n]*)"?$`, "m"))?.[1] ?? "";
  const env = { apiUrl: get("API_URL"), anonKey: get("ANON_KEY"), serviceRoleKey: get("SERVICE_ROLE_KEY") };
  if (!env.apiUrl || !env.anonKey || !env.serviceRoleKey) {
    throw new Error("`supabase status -o env` returned no API_URL / ANON_KEY / SERVICE_ROLE_KEY.");
  }
  cached = env;
  return env;
}

export const APP_URL = process.env.E2E_APP_URL ?? "http://localhost:5173";

/** Today in Europe/Berlin as YYYY-MM-DD — the app's business date. */
export function berlinToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(new Date());
}
