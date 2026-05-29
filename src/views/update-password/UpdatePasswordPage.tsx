"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import { PasswordInput } from "../../components/passwordInput/PasswordInput";
import { Banner } from "../../components/banner/Banner";
import { Button } from "../../components/button/Button";
import { VaultIcon } from "../../components/icons";
import { passwordChangeSchema } from "../../validation/ChangePasswordValidation";
import { MiniFooter } from "../../components/footer/MiniFooter";

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
      <div className="auth-bg flex flex-col min-h-screen">
        <div className="flex-1 flex items-center justify-center w-full p-4">
          <div className="flex flex-col gap-6 w-full max-w-md bg-color-bg-card p-8 rounded-xl border border-color-border-light text-center shadow-shadow-strong animate-scale-in">
            <h3 className="font-bold text-color-text-main">
              Passwort aktualisiert
            </h3>
            <p className="text-color-text-subtle">
              Ihr Passwort wurde erfolgreich geändert.
            </p>
            <Button onClick={() => router.push("/login")} text="Zur Anmeldung" />
          </div>
        </div>
        <MiniFooter />
      </div>
    );
  }

  return (
    <div className="auth-bg flex flex-col min-h-screen">
      <div className="flex-1 flex items-center justify-center w-full p-4">
        <div className="flex flex-col gap-6 w-full max-w-md bg-color-bg-card p-8 rounded-xl border border-color-border-light shadow-shadow-strong animate-scale-in">
          <div className="bg-color-primary/15 p-2 rounded-full mx-auto">
            <VaultIcon className="w-12 h-12 mx-auto text-color-primary" />
          </div>
          <h3 className="font-bold text-color-text-main">Neues Passwort</h3>
          <p className="text-color-text-subtle text-sm">
            Geben Sie Ihr neues Passwort ein.
          </p>

          {error && <Banner bannerType="error" title={error} description="" />}

          <PasswordInput
            label="Neues Passwort"
            value={password}
            onChange={(val) => setPassword(val)}
          />

          <PasswordInput
            label="Passwort wiederholen"
            value={repeatPassword}
            onChange={(val) => setRepeatPassword(val)}
            isRepeated
          />

          <div className="flex flex-col gap-3 mt-4">
            <Button
              onClick={handleUpdatePassword}
              text="Passwort speichern"
              isLoading={loading}
            />
          </div>

          <p className="text-color-text-subtle text-center text-sm mt-2">
            <Link href="/login">Zurück zur Anmeldung</Link>
          </p>
        </div>
      </div>
      <MiniFooter />
    </div>
  );
};
