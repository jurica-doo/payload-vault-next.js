import Link from "next/link";
import { AuthLayout, AuthResult } from "./AuthLayout";

interface EmailConfirmationProps {
  email: string;
}

export const EmailConfirmation = ({ email }: EmailConfirmationProps) => {
  return (
    <AuthLayout title="E-Mail überprüfen">
      <AuthResult action={<Link href="/login">Zurück zur Anmeldung</Link>}>
        Wir haben einen Bestätigungslink an{" "}
        <span className="font-semibold text-color-text-main">{email}</span>{" "}
        gesendet. Bitte klicken Sie auf den Link, um Ihr Konto zu aktivieren.
      </AuthResult>
    </AuthLayout>
  );
};
