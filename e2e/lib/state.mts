// What the fill scripts created (ids, TOTP secrets), for the tests and the
// `npm run totp` helper. Lives in e2e/.auth/ (git-ignored).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

// Resolved from the project root (npm scripts and Playwright run there), not
// import.meta: Playwright loads the specs as CommonJS.
export const STATE_FILE = process.env.E2E_STATE_FILE ?? join(process.cwd(), "e2e", ".auth", "state.json");

export type E2EState = {
  preparedAt: string;
  businessDate: string;
  totp: Record<string, { secret: string; factorId: string }>;
  employees: Record<string, string>; // email -> employee id
  users: Record<string, string>; // email -> auth user id
  production: Record<string, string>; // fixture key -> production id
};

export function emptyState(businessDate: string): E2EState {
  return { preparedAt: new Date().toISOString(), businessDate, totp: {}, employees: {}, users: {}, production: {} };
}

export function readState(): E2EState {
  if (!existsSync(STATE_FILE)) {
    throw new Error(`No e2e state at ${STATE_FILE}. Run: npm run e2e:prepare`);
  }
  return JSON.parse(readFileSync(STATE_FILE, "utf8")) as E2EState;
}

export function writeState(state: E2EState): void {
  mkdirSync(dirname(STATE_FILE), { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}
