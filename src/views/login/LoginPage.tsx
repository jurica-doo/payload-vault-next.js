"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "../../lib/supabase";
import { InputField } from "../../components/inputField/InputField";
import { PasswordInput } from "../../components/passwordInput/PasswordInput";
import { useAuth } from "../../context/AuthContext";
import { Banner } from "../../components/banner/Banner";
import { Button } from "../../components/button/Button";
import { loginSchema } from "../../validation/LoginValidation";
import { AuthLayout } from "../../components/auth/AuthLayout";
import { safeInternalPath } from "../../utils/safeRedirect";

export const LoginPage = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (user) {
      router.replace(safeInternalPath(searchParams.get("from")));
    }
  }, [user, router, searchParams]);

  const handleLogin = async () => {
    setError(null);

    const result = loginSchema.safeParse({ email, password });

    if (!result.success) {
      const message = result.error.issues[0].message;

      setError(message);
      return;
    }

    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email: result.data.email,
      password: result.data.password,
    });

    if (error) {
      setError("Ungültige Anmeldedaten oder Passwort");
    }

    setLoading(false);
  };

  return (
    <AuthLayout
      title="Willkommen zurück"
      description="Melden Sie sich mit Ihrer Profina-E-Mail-Adresse an."
      footer={
        <>
          <Link href="/passwort-zurucksetzen">Passwort vergessen?</Link>
          <span className="text-xs">
            Noch kein Zugang? Konten werden von der Verwaltung per Einladung
            angelegt.
          </span>
        </>
      }
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
              handleLogin();
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

            <PasswordInput
              label="Passwort"
              name="password"
              autoComplete="current-password"
              value={password}
              onChange={(val) => setPassword(val)}
            />

            <Button type="submit" text="Anmelden" isLoading={loading} size="large" fullWidth className="mt-1" />
          </form>
    </AuthLayout>
  );
};
