"use client";

import { useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "../../components/button/Button";
import { InputField } from "../../components/inputField/InputField";
import { useBanner } from "../../context/banner/BannerContext";
import { supabase } from "../../lib/supabase";

type State =
  | { kind: "loading" }
  | { kind: "none" } // no verified factor yet
  | { kind: "enrolling"; factorId: string; qrCode: string; secret: string }
  | { kind: "needsChallenge"; factorId: string } // factor exists, session is aal1
  | { kind: "verified" } // session is aal2
  | { kind: "error"; message: string };

const CODE = /^\d{6}$/;

/**
 * TOTP two-factor login (Supabase MFA). Required for admin and finance
 * actions: the database rejects their writes unless the JWT says aal2.
 */
export const SecurityPage = () => {
  const queryClient = useQueryClient();
  const { showBanner } = useBanner();
  const [state, setState] = useState<State>({ kind: "loading" });
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [{ data: factors, error }, { data: aal }] = await Promise.all([
      supabase.auth.mfa.listFactors(),
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    ]);
    if (error) {
      setState({ kind: "error", message: "Status konnte nicht geladen werden." });
      return;
    }
    const verified = factors.totp.find((f) => f.status === "verified");
    if (!verified) setState({ kind: "none" });
    else if (aal?.currentLevel === "aal2") setState({ kind: "verified" });
    else setState({ kind: "needsChallenge", factorId: verified.id });
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial load from Supabase Auth
    void load();
  }, [load]);

  const startEnrolment = async () => {
    setBusy(true);
    try {
      // An abandoned earlier attempt leaves an unverified factor behind; it
      // would block a new enrolment, so clear it first.
      const { data } = await supabase.auth.mfa.listFactors();
      for (const f of data?.all ?? []) {
        if (f.factor_type === "totp" && f.status === "unverified") {
          await supabase.auth.mfa.unenroll({ factorId: f.id });
        }
      }
      const { data: enrolled, error } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: `Authenticator ${new Date().toISOString().slice(0, 10)}`,
      });
      if (error || !enrolled) throw error;
      setState({ kind: "enrolling", factorId: enrolled.id, qrCode: enrolled.totp.qr_code, secret: enrolled.totp.secret });
    } catch {
      showBanner("Fehler", "Die Einrichtung konnte nicht gestartet werden.", "error");
    } finally {
      setBusy(false);
    }
  };

  const verify = async (factorId: string) => {
    const trimmed = code.replace(/\s/g, "");
    if (!CODE.test(trimmed)) {
      setCodeError("Bitte den 6-stelligen Code aus der App eingeben.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: trimmed });
    setBusy(false);
    if (error) {
      setCodeError("Der Code ist ungültig oder abgelaufen. Bitte den aktuellen Code eingeben.");
      return;
    }
    setCode("");
    setCodeError(undefined);
    // The session is now aal2; refresh everything that depends on it.
    await queryClient.invalidateQueries({ queryKey: ["myContext"] });
    showBanner("Bestätigt", "Ihre Anmeldung ist mit dem zweiten Faktor bestätigt.", "success");
    await load();
  };

  const codeForm = (factorId: string, submitText: string) => (
    <form
      className="flex flex-col gap-3 sm:max-w-xs"
      onSubmit={(e) => {
        e.preventDefault();
        void verify(factorId);
      }}
    >
      <InputField
        label="Code aus der Authenticator-App"
        placeholder="123456"
        value={code}
        onChange={(v) => {
          setCode(v);
          setCodeError(undefined);
        }}
        error={codeError}
        autoComplete="one-time-code"
        name="otp"
      />
      <div>
        <Button type="submit" text={submitText} isLoading={busy} />
      </div>
    </form>
  );

  return (
    <section className="flex flex-col gap-4 rounded-radius-lg bg-color-bg-card p-5 shadow-shadow-soft">
      <h2 className="text-lg font-semibold">Zwei-Faktor-Anmeldung</h2>

      {state.kind === "loading" && <p className="text-sm">Status wird geladen…</p>}
      {state.kind === "error" && <p className="text-sm text-color-error-text">{state.message}</p>}

      {state.kind === "none" && (
        <>
          <p className="text-sm">
            Schützen Sie Ihr Konto mit einer Authenticator-App (z. B. Google Authenticator, Microsoft Authenticator, 1Password). Für Verwaltung und Finanzen ist das Pflicht.
          </p>
          <div>
            <Button text="Einrichten" onClick={startEnrolment} isLoading={busy} />
          </div>
        </>
      )}

      {state.kind === "enrolling" && (
        <>
          <p className="text-sm">1. QR-Code mit der Authenticator-App scannen.</p>
          {/* eslint-disable-next-line @next/next/no-img-element -- data: URI from Supabase, nothing to optimise */}
          <img src={state.qrCode} alt="QR-Code für die Authenticator-App" className="h-48 w-48 rounded-radius-md bg-white p-2" />
          <p className="text-xs">
            Kein Scan möglich? Schlüssel manuell eingeben:{" "}
            <code className="break-all rounded-radius-sm bg-color-bg-dark px-1">{state.secret}</code>
          </p>
          <p className="text-sm">2. Den angezeigten Code eingeben.</p>
          {codeForm(state.factorId, "Bestätigen")}
        </>
      )}

      {state.kind === "needsChallenge" && (
        <>
          <p className="text-sm">
            Die Zwei-Faktor-Anmeldung ist eingerichtet. Bitte bestätigen Sie diese Sitzung mit dem aktuellen Code.
          </p>
          {codeForm(state.factorId, "Sitzung bestätigen")}
        </>
      )}

      {state.kind === "verified" && (
        <p className="text-sm text-color-success-text">Eingerichtet – diese Sitzung ist bestätigt.</p>
      )}
    </section>
  );
};
