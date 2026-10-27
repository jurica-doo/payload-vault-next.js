"use client";

import { authErrorMessage } from "../../utils/authErrors";
import { useState } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabase";
import { InputField } from "../../components/inputField/InputField";
import { Banner } from "../../components/banner/Banner";
import { Button } from "../../components/button/Button";
import { z } from "zod";
import { AuthLayout, AuthResult } from "../../components/auth/AuthLayout";

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
      setError(authErrorMessage(error, "reset"));
    } else {
      setIsSent(true);
    }

    setLoading(false);
  };

  if (isSent) {
    return (
      <AuthLayout title="E-Mail gesendet">
        <AuthResult
          action={
            <Link
              href="/login"
              className="inline-flex h-11 w-full items-center justify-center rounded-radius-md border border-color-border-strong bg-color-bg-card text-sm font-medium text-color-text-main no-underline transition-all hover:bg-color-bg-hover hover:no-underline active:scale-[0.98]"
            >
              Zurück zur Anmeldung
            </Link>
          }
        >
          Wir haben einen Link zum Zurücksetzen des Passworts an{" "}
          <span className="font-semibold text-color-text-main">{email}</span>{" "}
          gesendet. Bitte prüfen Sie Ihr Postfach – auch den Spam-Ordner.
        </AuthResult>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Passwort zurücksetzen"
      description="Geben Sie Ihre E-Mail-Adresse ein. Wir senden Ihnen einen Link zum Zurücksetzen."
      footer={<Link href="/login">Zurück zur Anmeldung</Link>}
    >
          {error && (
            <div className="mb-5 animate-slide-down">
              <Banner bannerType="error" title="Link nicht gesendet" description={error} />
            </div>
          )}

          <form
            className="flex flex-col gap-5"
            onSubmit={(e) => {
              e.preventDefault();
              handleReset();
            }}
          >
            <InputField
              label="E-Mail"
              placeholder="nachname@pro-fina.de"
              type="email"
              name="email"
              autoComplete="email"
              value={email}
              onChange={(val) => setEmail(val)}
            />

            <Button type="submit" text="Link senden" isLoading={loading} size="large" fullWidth className="mt-1" />
          </form>
    </AuthLayout>
  );
};
