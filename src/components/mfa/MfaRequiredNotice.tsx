import Link from "next/link";

/**
 * Admin and finance actions require MFA (plan §4.3). The database refuses
 * them at aal1 anyway; this notice explains why and where to fix it.
 */
export const MfaRequiredNotice = () => (
  <div
    role="note"
    className="rounded-radius-md border border-color-secondary/40 bg-color-secondary/10 px-4 py-3 text-sm text-color-text-secondary"
  >
    <span className="font-semibold text-color-secondary">Zwei-Faktor-Anmeldung erforderlich. </span>
    Änderungen in der Verwaltung sind erst nach Bestätigung mit Ihrer Authenticator-App möglich.{" "}
    <Link href="/profil/sicherheit" className="font-semibold">
      Jetzt einrichten oder bestätigen
    </Link>
  </div>
);
