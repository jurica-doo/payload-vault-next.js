"use client";

import { useState } from "react";
import { Button } from "../../components/button/Button";
import { MiniFooter } from "../../components/footer/MiniFooter";
import { Notice } from "../../components/notice/Notice";

/** What the client stops receiving, per consent purpose of the mail. */
export const UNSUBSCRIBE_PURPOSE: Record<string, string> = {
  birthday_email: "Geburtstagsgrüße",
  holiday_email: "Feiertagsgrüße",
  marketing_email: "Werbe-E-Mails",
  contact_email: "Service-E-Mails",
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type State = "idle" | "sending" | "done" | "invalid" | "busy" | "failed";

/**
 * Unsubscribe page for clients (opened from the link in every e-mail). A page
 * view changes nothing — link scanners open links too — only the button does:
 * it asks the Edge Function email-unsubscribe to record the withdrawal.
 */
export const UnsubscribePage = ({ token, purpose }: { token: string; purpose: string }) => {
  const label = UNSUBSCRIBE_PURPOSE[purpose];
  const validLink = UUID.test(token) && !!label;
  const [state, setState] = useState<State>(validLink ? "idle" : "invalid");

  const confirm = async () => {
    setState("sending");
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/email-unsubscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "" },
        body: JSON.stringify({ t: token, z: purpose }),
      });
      if (res.ok) return setState("done");
      setState(res.status === 404 || res.status === 400 ? "invalid" : res.status === 429 ? "busy" : "failed");
    } catch {
      setState("failed");
    }
  };

  return (
    <div className="flex min-h-screen flex-col">
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-4 py-10 animate-fade-in">
        <div className="ui-card flex flex-col gap-4 p-6 sm:p-8">
          <p className="text-sm font-semibold text-color-primary">Profina</p>
          <h1 className="text-color-text-main">Von E-Mails abmelden</h1>
          {state === "done" ? (
            <Notice tone="success" title="Sie sind abgemeldet.">
              Sie erhalten keine {label} mehr. Ihre Beraterin oder Ihr Berater sieht die Abmeldung. Falls Sie es sich anders
              überlegen, sprechen Sie sie oder ihn einfach an.
            </Notice>
          ) : state === "invalid" ? (
            <Notice tone="warning" title="Dieser Link funktioniert nicht.">
              Er ist unvollständig oder nicht mehr gültig. Bitte nutzen Sie den Link aus einer neueren E-Mail oder antworten Sie auf
              die E-Mail mit dem Wunsch, keine Nachrichten mehr zu erhalten.
            </Notice>
          ) : (
            <>
              <p className="text-color-text-secondary">
                Möchten Sie keine <strong>{label}</strong> von Profina mehr erhalten? Bestätigen Sie die Abmeldung mit einem Klick.
                Andere Nachrichten, etwa zu Ihren Verträgen, sind davon nicht betroffen.
              </p>
              {state === "busy" && <Notice tone="warning">Zu viele Versuche in kurzer Zeit. Bitte versuchen Sie es in einer Stunde erneut.</Notice>}
              {state === "failed" && <Notice tone="error">Die Abmeldung hat gerade nicht geklappt. Bitte versuchen Sie es gleich noch einmal.</Notice>}
              <div>
                <Button text="Abmelden bestätigen" onClick={confirm} isLoading={state === "sending"} />
              </div>
            </>
          )}
        </div>
      </main>
      <MiniFooter />
    </div>
  );
};
