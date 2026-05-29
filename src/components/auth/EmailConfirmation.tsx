import Link from "next/link";

interface EmailConfirmationProps {
  email: string;
}

export const EmailConfirmation = ({ email }: EmailConfirmationProps) => {
  return (
    <div className="auth-bg flex flex-col items-center justify-center min-h-screen p-4">
      <div className="flex flex-col gap-6 w-full max-w-md bg-color-bg-card border border-color-border-light p-8 rounded-xl text-center shadow-shadow-strong animate-scale-in">
        <h1 className="text-2xl font-bold text-color-text-main">
          E-Mail überprüfen
        </h1>
        <p className="text-color-text-subtle">
          Wir haben einen Bestätigungslink an{" "}
          <span className="text-color-text-main font-bold">{email}</span>{" "}
          gesendet. Bitte klicken Sie auf den Link, um Ihr Konto zu aktivieren.
        </p>
        {/* Use Link instead of a button with state */}
        <Link
          href="/login"
          className="text-sm text-color-text-subtle underline hover:text-color-text-main transition-colors duration-200"
        >
          Zurück zur Anmeldung
        </Link>
      </div>
    </div>
  );
};
