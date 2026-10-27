import Link from "next/link";
import { Notice } from "../notice/Notice";

/**
 * Admin and finance actions require MFA (plan §4.3). The database refuses
 * them at aal1 anyway; this notice explains why and where to fix it.
 */
export const MfaRequiredNotice = () => (
  <Notice
    tone="warning"
    title="Zwei-Faktor-Anmeldung erforderlich."
    action={
      <Link href="/profil/sicherheit" className="font-semibold">
        Jetzt einrichten oder bestätigen
      </Link>
    }
  >
    Änderungen in der Verwaltung sind erst nach Bestätigung mit Ihrer
    Authenticator-App möglich.
  </Notice>
);
