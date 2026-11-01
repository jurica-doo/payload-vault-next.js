// Sessions prepared once by e2e/global-setup.ts and shared by all workers.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Session } from "../lib/api.mts";

export const SESSIONS_FILE = join(process.cwd(), "e2e", ".auth", "sessions.json");

let cache: Record<string, Session> | undefined;

/** The prepared API session of a test account (`aal2` = 2FA confirmed). */
export function apiSession(email: string, aal2 = false): Session {
  cache ??= JSON.parse(readFileSync(SESSIONS_FILE, "utf8")) as Record<string, Session>;
  const s = cache[`${email}|${aal2 ? "aal2" : "aal1"}`];
  if (!s) throw new Error(`no prepared ${aal2 ? "aal2 " : ""}session for ${email} (see e2e/global-setup.ts)`);
  return s;
}
