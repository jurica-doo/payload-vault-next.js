/**
 * Normalisation for identity fields, shared by forms and duplicate checks
 * (employees now; leads and customers in Phases 4–5, spec §9.5).
 */

const E164 = /^\+[1-9]\d{6,14}$/;

/**
 * German-friendly phone input → E.164 ("+49…"), or null if it can't be one.
 *   "0170 123 4567"     → "+491701234567"
 *   "+49 (0) 170-1234567" → "+491701234567"
 *   "0049 170 1234567"  → "+491701234567"
 *   "+43 664 1234567"   → "+436641234567"   (other countries kept)
 * Numbers without a country code are assumed German.
 */
export function normalizePhone(input: string): string | null {
  const trimmed = input.trim();
  if (trimmed === "") return null;
  if (/[^\d\s()+\-./]/.test(trimmed)) return null;

  let digits = trimmed.replace(/\(0\)/g, "").replace(/[\s()\-./]/g, "");
  if (digits.startsWith("00")) digits = `+${digits.slice(2)}`;
  else if (digits.startsWith("0")) digits = `+49${digits.slice(1)}`;
  else if (!digits.startsWith("+")) return null;

  if (digits.indexOf("+", 1) !== -1) return null;
  return E164.test(digits) ? digits : null;
}

/** Lowercased, trimmed email, or null when it doesn't look like one. */
export function normalizeEmail(input: string): string | null {
  const email = input.trim().toLowerCase();
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? email : null;
}
