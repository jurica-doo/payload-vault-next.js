"use client";

import type React from "react";
import { ShieldIcon } from "../../components/icons";
import { StatusBadge } from "../../components/statusBadge/StatusBadge";
import { Notice } from "../../components/notice/Notice";
import { LoadingState } from "../../components/loadingState/LoadingState";
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
    <section className="ui-card flex flex-col gap-5 p-5 sm:p-6 animate-fade-in">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-radius-md bg-color-bg-accent-subtle text-color-text-accent">
            <ShieldIcon size={20} />
          </span>
          <div className="flex flex-col gap-0.5">
            <h2 className="text-[1.0625rem] font-semibold">Zwei-Faktor-Anmeldung</h2>
            <p className="text-[0.8125rem] text-color-text-subtle">Zusätzlicher Schutz mit einem Einmal-Code aus Ihrer Authenticator-App.</p>
          </div>
        </div>
        {state.kind !== "loading" && state.kind !== "error" && (
          <StatusBadge
            status={state.kind}
            map={{
              none: { label: "Nicht eingerichtet", tone: "warning" },
              enrolling: { label: "Einrichtung läuft", tone: "info" },
              needsChallenge: { label: "Bestätigung nötig", tone: "warning" },
              verified: { label: "Aktiv", tone: "success" },
            }}
          />
        )}
      </div>

      {state.kind === "loading" && <LoadingState label="Status wird geladen…" />}
      {state.kind === "error" && <Notice tone="error">{state.message}</Notice>}

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
          <Step n={1}>QR-Code mit der Authenticator-App scannen.</Step>
          {/* eslint-disable-next-line @next/next/no-img-element -- data: URI from Supabase, nothing to optimise */}
          <img src={state.qrCode} alt="QR-Code für die Authenticator-App" className="ml-9 h-44 w-44 rounded-radius-lg bg-white p-2 ring-1 ring-color-border-light animate-scale-in" />
          <p className="ml-9 text-xs">
            Kein Scan möglich? Schlüssel manuell eingeben:{" "}
            <code className="break-all rounded-radius-sm bg-color-bg-alt px-1.5 py-0.5 font-mono text-color-text-main ring-1 ring-inset ring-color-border-light">{state.secret}</code>
          </p>
          <Step n={2}>Den angezeigten 6-stelligen Code eingeben.</Step>
          <div className="ml-9">{codeForm(state.factorId, "Bestätigen")}</div>
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
        <div className="flex items-center gap-3 rounded-radius-lg bg-color-success/8 p-4 ring-1 ring-inset ring-color-success/20">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-color-success/15 text-color-success-text animate-pop-in">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="m5 12 5 5 9-10" className="animate-draw-check" />
            </svg>
          </span>
          <p className="text-sm text-color-text-main">
            <span className="font-semibold">Eingerichtet</span> – diese Sitzung ist bestätigt. Verwaltungs- und Finanzfunktionen sind freigeschaltet.
          </p>
        </div>
      )}
    </section>
  );
};

const Step = ({ n, children }: { n: number; children: React.ReactNode }) => (
  <p className="flex items-center gap-3 text-sm text-color-text-main">
    <span className="tabular flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-color-bg-accent-subtle text-xs font-semibold text-color-text-accent">
      {n}
    </span>
    {children}
  </p>
);
