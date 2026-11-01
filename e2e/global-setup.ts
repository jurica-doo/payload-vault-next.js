// Runs once before all tests:
// 1. signs every test account in (TOTP accounts also at aal2) and saves the
//    sessions, so parallel workers never verify the same TOTP code at the
//    same moment (GoTrue rejects concurrent verifies of one factor);
// 2. requests every page once, so the dev server compiles them up front.
import { writeFileSync } from "node:fs";
import { CAST, SEED } from "./fixtures/phase1.mts";
import { signIn, signInAal2, type Session } from "./lib/api.mts";
import { APP_URL } from "./lib/env.mts";
import { readState } from "./lib/state.mts";
import { SESSIONS_FILE } from "./tests/sessions";

const ROUTES = [
  "/login",
  "/",
  "/einnahmen",
  "/vertrieb",
  "/vertrieb/produktion",
  "/vertrieb/produktion/import",
  "/vertrieb/team",
  "/vertrieb/karriere",
  "/admin",
  "/admin/mitarbeiter",
  "/admin/hierarchie",
  "/admin/regeln",
  "/admin/befoerderungen",
  "/profil/sicherheit",
];

export default async function globalSetup(): Promise<void> {
  const started = Date.now();
  const state = readState();
  const accounts = [...Object.values(SEED), ...CAST.filter((m) => m.login).map((m) => m.email)];
  const sessions: Record<string, Session> = {};
  for (const email of accounts) sessions[`${email}|aal1`] = await signIn(email);
  for (const [email, totp] of Object.entries(state.totp)) sessions[`${email}|aal2`] = await signInAal2(email, totp);
  writeFileSync(SESSIONS_FILE, JSON.stringify(sessions));

  const results = await Promise.all(
    ROUTES.map(async (route) => {
      const res = await fetch(`${APP_URL}${route}`);
      await res.arrayBuffer();
      return { route, status: res.status };
    }),
  );
  const broken = results.filter((r) => r.status >= 500);
  if (broken.length > 0) {
    throw new Error(`Dev server errors on ${broken.map((r) => `${r.route} (${r.status})`).join(", ")}`);
  }
  console.log(
    `Setup: ${Object.keys(sessions).length} sessions, ${ROUTES.length} pages compiled in ${((Date.now() - started) / 1000).toFixed(1)} s`,
  );
}
