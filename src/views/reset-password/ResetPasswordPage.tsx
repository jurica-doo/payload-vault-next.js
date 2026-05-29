"use client";

import { useState } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabase";
import { InputField } from "../../components/inputField/InputField";
import { Banner } from "../../components/banner/Banner";
import { Button } from "../../components/button/Button";
import { VaultIcon } from "../../components/icons";
import { z } from "zod";
import { MiniFooter } from "../../components/footer/MiniFooter";

const emailSchema = z
  .string()
  .min(1, "E-Mail ist erforderlich")
  .email("Ungültige E-Mail-Adresse");

export const ResetPasswordPage = () => {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSent, setIsSent] = useState(false);

  const handleReset = async () => {
    setError(null);

    const result = emailSchema.safeParse(email);

    if (!result.success) {
      setError(result.error.issues[0].message);
      return;
    }

    setLoading(true);

    const { error } = await supabase.auth.resetPasswordForEmail(result.data, {
      redirectTo: `${window.location.origin}/update-passwort`,
    });

    if (error) {
      setError(
        "Der Link konnte nicht gesendet werden. Bitte versuchen Sie es später erneut.",
      );
    } else {
      setIsSent(true);
    }

    setLoading(false);
  };

  if (isSent) {
    return (
      <div className="auth-bg flex flex-col min-h-screen">
        <div className="flex-1 flex items-center justify-center w-full p-4">
          <div className="flex flex-col gap-6 w-full max-w-md bg-color-bg-card p-8 rounded-xl border border-color-border-light text-center shadow-shadow-strong animate-scale-in">
            <h3 className="font-bold text-color-text-main">E-Mail gesendet</h3>
            <p className="text-color-text-subtle">
              Wir haben einen Link zum Zurücksetzen des Passworts an{" "}
              <span className="font-bold text-color-text-main">{email}</span>{" "}
              gesendet. Bitte überprüfen Sie Ihr Postfach.
            </p>
            <Link
              href="/login"
              className="text-sm text-color-text-subtle underline hover:text-color-text-main transition-colors"
            >
              Zurück zur Anmeldung
            </Link>
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
          <h3 className="font-bold text-color-text-main">
            Passwort zurücksetzen
          </h3>
          <p className="text-color-text-subtle text-sm">
            Geben Sie Ihre E-Mail-Adresse ein und wir senden Ihnen einen Link
            zum Zurücksetzen Ihres Passworts.
          </p>

          {error && <Banner bannerType="error" title={error} description="" />}

          <InputField
            label="Email"
            placeholder="nachname@pro-fina.de"
            value={email}
            onChange={(val) => setEmail(val)}
          />

          <div className="flex flex-col gap-3 mt-4">
            <Button
              onClick={handleReset}
              text="Link senden"
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
