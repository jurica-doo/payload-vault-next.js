"use client";

import { authErrorMessage } from "../../utils/authErrors";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "../../lib/supabase";
import { InputField } from "../../components/inputField/InputField";
import { PasswordInput } from "../../components/passwordInput/PasswordInput";
import { useAuth } from "../../context/AuthContext";
import { EmailConfirmation } from "../../components/auth/EmailConfirmation";
import { Banner } from "../../components/banner/Banner";
import { Button } from "../../components/button/Button";
import { signUpSchema } from "../../validation/SignUpValidation";
import { AuthLayout } from "../../components/auth/AuthLayout";
import { safeInternalPath } from "../../utils/safeRedirect";

export const SignUpPage = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [repeatedPassword, setRepeatedPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSent, setIsSent] = useState(false);

  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (user) {
      router.replace(safeInternalPath(searchParams.get("from")));
    }
  }, [user, router, searchParams]);

  const handleSignUp = async () => {
    setError(null);

    const result = signUpSchema.safeParse({
      email,
      password,
      repeatedPassword,
    });

    if (!result.success) {
      const message = result.error.issues[0].message;

      setError(message);
      return;
    }

    setLoading(true);

    const { data, error: signUpError } = await supabase.auth.signUp({
      email: result.data.email,
      password: result.data.password,
      options: {
        emailRedirectTo: window.location.origin,
      },
    });

    if (signUpError) {
      setError(authErrorMessage(signUpError, "signup"));
    } else if (
      data.user?.identities?.length === 0 ||
      (data.user &&
        data.session === null &&
        data.user.confirmed_at !== null &&
        data.user.confirmed_at !== undefined)
    ) {
      setError("Ein Konto mit dieser E-Mail-Adresse existiert bereits.");
    } else if (data.user && data.session === null) {
      setIsSent(true);
    }

    setLoading(false);
  };

  if (isSent) {
    return <EmailConfirmation email={email} />;
  }

  return (
    <AuthLayout
      title="Konto erstellen"
      footer={
        <span>
          Schon ein Konto? <Link href="/login">Anmelden</Link>
        </span>
      }
    >
          {error && (
            <div className="mb-5 animate-slide-down">
              <Banner bannerType="error" title="Registrierung nicht möglich" description={error} />
            </div>
          )}

          <form
            className="flex flex-col gap-5"
            onSubmit={(e) => {
              e.preventDefault();
              handleSignUp();
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
              autoComplete="new-password"
              value={password}
              onChange={(val) => setPassword(val)}
            />

            <PasswordInput
              label="Passwort wiederholen"
              name="repeated-password"
              autoComplete="new-password"
              value={repeatedPassword}
              onChange={(val) => setRepeatedPassword(val)}
              isRepeated
            />

            <Button type="submit" text="Registrieren" isLoading={loading} size="large" fullWidth className="mt-1" />
          </form>
    </AuthLayout>
  );
};
