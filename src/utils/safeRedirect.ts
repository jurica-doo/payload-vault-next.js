/**
 * Safe handling of the `?from=` return path used by the auth pages.
 *
 * `ProtectedRoute` bounces signed-out users to `/login?from=<pathname>` and the
 * login/signup pages send them back there once a session exists. That value is
 * fully attacker-controlled (anyone can hand out a crafted link), so it must
 * never be passed to `router.replace()` unchecked: Next's App Router resolves
 * the target against `location.href` and performs a real hard navigation
 * whenever the resulting origin differs from ours. A link such as
 * `/login?from=https://evil.example` would therefore drop the user on an
 * attacker page *after* a successful login — a very convincing phishing hop.
 *
 * `javascript:` URLs are additionally blocked by Next itself, but we reject
 * them here too rather than relying on a framework internal.
 *
 * The rule below is deliberately strict: only same-site, absolute, single-slash
 * paths are accepted. Everything else falls back to the app root.
 */
export const DEFAULT_REDIRECT = "/";

export function safeInternalPath(
  value: string | null | undefined,
  fallback: string = DEFAULT_REDIRECT,
): string {
  if (!value) return fallback;

  // Must be an absolute in-app path. This rejects "https://evil.com",
  // "javascript:...", "data:..." and any other scheme-bearing value.
  if (!value.startsWith("/")) return fallback;

  // Reject protocol-relative ("//evil.com") and backslash variants
  // ("/\evil.com", "\\evil.com") — browsers normalise several of these into a
  // scheme-relative URL pointing at another host.
  if (value.startsWith("//") || value.includes("\\")) return fallback;

  // Control characters (incl. NUL, CR, LF and tab) can be used to smuggle a
  // different target past naive parsers; no legitimate path contains them.
  if (/[\u0000-\u001f\u007f]/.test(value)) return fallback;

  // Final authoritative check: resolve against a throwaway origin and confirm
  // nothing escaped it. Using the URL parser rather than string prefix checks
  // means we inherit the browser's own normalisation rules.
  try {
    const base = "https://payload-vault.invalid";
    const resolved = new URL(value, base);
    if (resolved.origin !== base) return fallback;
    return `${resolved.pathname}${resolved.search}${resolved.hash}`;
  } catch {
    return fallback;
  }
}
