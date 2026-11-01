// Prints the current 2FA code for test accounts that the fill script set up.
//   npm run totp                    → all accounts
//   npm run totp -- admin@test.com  → one account
import { readState } from "./lib/state.mts";
import { totp } from "./lib/totp.mts";

const state = readState();
const wanted = process.argv[2];
const entries = Object.entries(state.totp).filter(([email]) => !wanted || email === wanted);
if (entries.length === 0) {
  console.error(wanted ? `No TOTP secret for ${wanted}. Known: ${Object.keys(state.totp).join(", ")}` : "No TOTP secrets in the e2e state.");
  process.exit(1);
}
const secondsLeft = 30 - (Math.floor(Date.now() / 1000) % 30);
for (const [email, { secret }] of entries) {
  console.log(`${email.padEnd(24)} ${totp(secret)}   (noch ${secondsLeft} s gültig; Schlüssel für eine App: ${secret})`);
}
