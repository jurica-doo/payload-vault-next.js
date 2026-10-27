"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import { PasswordInput } from "../../components/passwordInput/PasswordInput";
import { Banner } from "../../components/banner/Banner";
import { Button } from "../../components/button/Button";
import { passwordChangeSchema } from "../../validation/ChangePasswordValidation";
import { AuthLayout, AuthResult } from "../../components/auth/AuthLayout";

export const UpdatePasswordPage = () => {
  const [password, setPassword] = useState("");
  const [repeatPassword, setRepeatPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isUpdated, setIsUpdated] = useState(false);

  const router = useRouter();

  const handleUpdatePassword = async () => {
    setError(null);

    const result = passwordChangeSchema.safeParse({
      password,
      repeatPassword,
    });

    if (!result.success) {
      setError(result.error.issues[0].message);
      return;
    }

    setLoading(true);

    const { error } = await supabase.auth.updateUser({
      password: result.data.password,
    });

    if (error) {
      setError(
        "Passwort konnte nicht aktualisiert werden. Bitte versuchen Sie es erneut.",
      );
    } else {
      setIsUpdated(true);
    }

    setLoading(false);
  };

  if (isUpdated) {
    return (
      <AuthLayout title="Passwort gespeichert">
        <AuthResult
          action={
            <Button
              onClick={() => router.push("/login")}
              text="Zur Anmeldung"
              size="large"
              fullWidth
            />
          }
        >
          Ihr Passwort wurde erfolgreich gespeichert. Sie können sich jetzt
          anmelden.
        </AuthResult>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Passwort festlegen"
      description="Wählen Sie ein sicheres Passwort für Ihr Konto."
      footer={<Link href="/login">Zurück zur Anmeldung</Link>}
    >
          {error && (
            <div className="mb-5 animate-slide-down">
              <Banner bannerType="error" title={error} description="" />
            </div>
          )}

          <form
            className="flex flex-col gap-5"
            onSubmit={(e) => {
              e.preventDefault();
              handleUpdatePassword();
            }}
          >
            <PasswordInput
              label="Neues Passwort"
              name="password"
              autoComplete="new-password"
              value={password}
              onChange={(val) => setPassword(val)}
            />

            <PasswordInput
              label="Passwort wiederholen"
              name="repeated-password"
              autoComplete="new-password"
              value={repeatPassword}
              onChange={(val) => setRepeatPassword(val)}
              isRepeated
            />

            <Button type="submit" text="Passwort speichern" isLoading={loading} size="large" fullWidth className="mt-1" />
          </form>
    </AuthLayout>
  );
};
