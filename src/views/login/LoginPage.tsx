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
import { VaultIcon } from "../../components/icons";
import { loginSchema } from "../../validation/LoginValidation";
import { MiniFooter } from "../../components/footer/MiniFooter";

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
      const origin = searchParams.get("from") || "/";
      router.replace(origin);
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
    <div className="auth-bg flex flex-col min-h-screen">
      <div className="flex-1 flex items-center justify-center w-full p-4">
        <div className="flex flex-col gap-6 w-full max-w-md bg-color-bg-card p-8 rounded-xl border border-color-border-light shadow-shadow-strong animate-scale-in">
          <div className="bg-color-primary/15 p-2 rounded-full mx-auto">
            <VaultIcon className="w-12 h-12 mx-auto text-color-primary" />
          </div>
          <h3 className="font-bold text-color-text-main">Anmelden</h3>

          {error && <Banner bannerType="error" title={error} description="" />}

          <InputField
            label="Email"
            placeholder="nachname@pro-fina.de"
            value={email}
            onChange={(val) => setEmail(val)}
          />

          <PasswordInput
            label="Passwort"
            value={password}
            onChange={(val) => setPassword(val)}
          />

          <div className="flex flex-col gap-3 mt-4">
            <Button onClick={handleLogin} text="Anmelden" isLoading={loading} />
          </div>

          <p className="text-color-text-subtle text-center text-sm mt-2">
            Noch kein Konto? <Link href="/signup">Registrieren</Link>
          </p>
          <p className="text-color-text-subtle text-center text-sm">
            Passwort vergessen?{" "}
            <Link href="/passwort-zurucksetzen">Passwort zurücksetzen</Link>
          </p>
        </div>
      </div>
      <MiniFooter />
    </div>
  );
};
