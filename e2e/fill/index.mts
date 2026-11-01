// Fills the local DB with the e2e test data, phase by phase.
// Expects a freshly reset DB: `npm run e2e:prepare` (= supabase db reset + this).
import { berlinToday } from "../lib/env.mts";
import { emptyState, STATE_FILE, writeState } from "../lib/state.mts";
import { fillPhase1 } from "./phase1.mts";

const state = emptyState(berlinToday());
const started = Date.now();
try {
  await fillPhase1(state);
} finally {
  writeState(state);
}
console.log(`\nDone in ${((Date.now() - started) / 1000).toFixed(1)} s. State: ${STATE_FILE}`);
console.log("All test accounts use the password 123456. TOTP codes: npm run totp -- <email>");
