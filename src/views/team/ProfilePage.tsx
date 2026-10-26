"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "../../components/button/Button";
import { DateInput, TextArea } from "../../components/formFields/FormFields";
import { InputField } from "../../components/inputField/InputField";
import { EmptyState } from "../../components/emptyState/EmptyState";
import { KpiTile } from "../../components/kpiTile/KpiTile";
import { TrendChart } from "../../components/charts/TrendChart";
import { StatusBadge } from "../../components/statusBadge/StatusBadge";
import { PointsValue } from "../../components/values/Values";
import { useBanner } from "../../context/banner/BannerContext";
import { usePermissions } from "../../hooks/permissions/usePermissions";
import { useCoaching, useProfile, type Prompt } from "../../hooks/useCoaching/useCoaching";
import { formatDate, formatPoints } from "../../utils/format";
import { goalStatus } from "../goals/GoalsPage";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MONTHS = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
const berlinToday = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date());

/** §8.3 prompts — conversation starters, never verdicts (§8.5). */
export const promptText = (p: Prompt): string => {
  switch (p.code) {
    case "kv_gap":
      return `Die Punkte für die nächste Stufe sind erreicht, es fehlen noch ${formatPoints(p.value)} KV-Punkte. Welche KV-Termine lassen sich einplanen?`;
    case "declining_trend":
      return `Die letzten drei Monate liegen unter den drei Monaten davor (Ø ${formatPoints(p.recent)} statt ${formatPoints(p.before)} P). Ein Gespräch über Ursachen kann helfen.`;
    case "behind_goal":
      return `Im laufenden Monat ${formatPoints(p.actual)} von ${formatPoints(p.target)} P – unter dem anteiligen Plan. Gemeinsam die Wochenplanung ansehen?`;
    case "overdue_actions":
      return `${p.count} vereinbarte Maßnahme(n) sind überfällig.`;
  }
};

export const ProfilePage = ({ employeeId }: { employeeId: string }) => {
  const valid = UUID.test(employeeId);
  if (!valid) return <EmptyState message="Unbekannte Person." />;
  return <Profile employeeId={employeeId} />;
};

const Profile = ({ employeeId }: { employeeId: string }) => {
  const { permissions } = usePermissions();
  const { data: p, isLoading, error } = useProfile(employeeId);
  const coaching = useCoaching(employeeId);
  const isManager = permissions.employeeId !== employeeId && permissions.isLeader;

  if (isLoading) return <p className="text-sm">Profil wird geladen…</p>;
  if (error || !p) return <EmptyState message="Profil nicht verfügbar." hint={error?.message} />;

  const last3 = p.trend.slice(-3).reduce((s, t) => s + Number(t.points), 0);
  return (
    <div className="flex flex-col gap-4">
      <Link href="/vertrieb/team" className="text-sm">← Struktur</Link>
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xl font-semibold">{p.employee.name}</h2>
        <span className="text-sm text-color-text-subtle">
          {p.employee.level ?? "keine Stufe"} · seit {formatDate(p.employee.start_date)}
          {p.next_review_on && <> · nächstes Gespräch {formatDate(p.next_review_on)}</>}
        </span>
      </header>

      {p.prompts.length > 0 && (
        <section className="flex flex-col gap-2 rounded-radius-lg border border-color-secondary/40 bg-color-secondary/10 p-3 text-sm">
          <h3 className="text-sm font-semibold">Gesprächsimpulse</h3>
          <ul className="flex flex-col gap-1">{p.prompts.map((x) => <li key={x.code}>• {promptText(x)}</li>)}</ul>
          <p className="text-xs text-color-text-subtle">Hinweise unterstützen das Gespräch, sie sind keine Bewertung.</p>
        </section>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <KpiTile label="Punkte letzte 3 Monate" value={<PointsValue value={last3} />} />
        <KpiTile label="Karriere" value={p.career.status === "ready" ? "qualifiziert" : p.career.target ? `→ ${p.career.target}` : "–"}
          hint={p.career.points_missing ? `fehlen ${formatPoints(p.career.points_missing)} P / ${formatPoints(p.career.kv_missing)} KV-P` : undefined} />
        <KpiTile label="Produktmix (12 Monate)" value={p.product_mix.map((m) => m.category).join(" · ") || "–"} />
      </div>

      <section className="rounded-radius-lg bg-color-bg-card p-4 shadow-shadow-soft">
        <TrendChart caption="Anrechenbare Punkte je Monat, letzte 12 Monate" data={p.trend.map((t) => ({ label: MONTHS[Number(t.month.slice(5, 7)) - 1], value: Number(t.points) }))} />
      </section>

      <section className="rounded-radius-lg bg-color-bg-card p-4 shadow-shadow-soft">
        <h3 className="mb-2 text-base font-semibold">Ziele</h3>
        {p.goals.length === 0 ? <p className="text-sm text-color-text-subtle">Keine Ziele erfasst.</p> : (
          <ul className="flex flex-col gap-1 text-sm">
            {p.goals.map((g) => (
              <li key={g.month} className="flex flex-wrap items-center justify-between gap-2">
                <span>{MONTHS[Number(g.month.slice(5, 7)) - 1]} {g.month.slice(0, 4)}: {formatPoints(g.actual)} von {g.target === null ? "–" : formatPoints(g.target)} P</span>
                <StatusBadge status={g.status} map={goalStatus} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <CoachingSection coaching={coaching} isManager={isManager} />
    </div>
  );
};

type CoachingHook = ReturnType<typeof useCoaching>;

const CoachingSection = ({ coaching, isManager }: { coaching: CoachingHook; isManager: boolean }) => {
  const { showBanner } = useBanner();
  const { permissions } = usePermissions();
  const [summary, setSummary] = useState("");
  const [heldOn, setHeldOn] = useState(berlinToday());
  const [nextReview, setNextReview] = useState("");
  const [actionTitle, setActionTitle] = useState("");
  const [actionDue, setActionDue] = useState("");
  const [note, setNote] = useState("");
  const [privateNote, setPrivateNote] = useState(true);
  const data = coaching.data;

  const saveSession = async () => {
    try {
      await coaching.addSession.mutateAsync({
        heldOn, summary, participants: "", nextReviewOn: nextReview || null,
        actions: actionTitle.trim() ? [{ title: actionTitle.trim(), owner: "employee", due_on: actionDue || null }] : [],
      });
      setSummary(""); setActionTitle(""); setActionDue(""); setNextReview("");
      showBanner("Gespräch gespeichert", "", "success");
    } catch (e) {
      showBanner("Nicht gespeichert", e instanceof Error ? e.message : "", "error");
    }
  };

  return (
    <section className="flex flex-col gap-4 rounded-radius-lg bg-color-bg-card p-4 shadow-shadow-soft">
      <h3 className="text-base font-semibold">Coaching</h3>

      <div>
        <h4 className="mb-1 text-sm font-semibold">Vereinbarte Maßnahmen</h4>
        {(data?.actions ?? []).length === 0 ? <p className="text-sm text-color-text-subtle">Keine Maßnahmen.</p> : (
          <ul className="flex flex-col gap-1 text-sm">
            {data!.actions.map((a) => {
              const canToggle = a.owner_id === permissions.employeeId || isManager;
              return (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-2">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={a.status === "done"} disabled={!canToggle || a.status === "cancelled"}
                      onChange={(e) => coaching.setActionStatus.mutate({ id: a.id, status: e.target.checked ? "done" : "open" })} />
                    <span className={a.status === "done" ? "line-through" : ""}>{a.title}</span>
                  </label>
                  <span className={`text-xs ${a.status === "open" && a.due_on && a.due_on < berlinToday() ? "text-color-error-text" : "text-color-text-subtle"}`}>
                    {a.due_on ? `fällig ${formatDate(a.due_on)}` : "ohne Termin"}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div>
        <h4 className="mb-1 text-sm font-semibold">Gespräche</h4>
        {(data?.sessions ?? []).length === 0 ? <p className="text-sm text-color-text-subtle">Noch keine Gespräche.</p> : (
          <ul className="flex flex-col gap-2 text-sm">
            {data!.sessions.map((s) => <li key={s.id}><span className="font-semibold">{formatDate(s.held_on)}</span> – {s.summary}</li>)}
          </ul>
        )}
      </div>

      {(data?.notes ?? []).length > 0 && (
        <div>
          <h4 className="mb-1 text-sm font-semibold">Notizen</h4>
          <ul className="flex flex-col gap-2 text-sm">
            {data!.notes.map((n) => (
              <li key={n.id}>
                {n.visibility === "private_manager" && <span className="mr-1 rounded-full border border-color-secondary/40 px-2 text-xs text-color-secondary">privat</span>}
                {n.body} <span className="text-xs text-color-text-subtle">({formatDate(n.created_at.slice(0, 10))})</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {isManager && (
        <>
          <div className="flex flex-col gap-3 border-t border-color-border-light pt-3">
            <h4 className="text-sm font-semibold">Gespräch dokumentieren</h4>
            <div className="grid gap-3 sm:grid-cols-2">
              <DateInput label="Datum" value={heldOn} max={berlinToday()} onChange={setHeldOn} />
              <DateInput label="Nächstes Gespräch" value={nextReview} min={heldOn} onChange={setNextReview} />
            </div>
            <TextArea label="Zusammenfassung (für die Person sichtbar)" value={summary} onChange={setSummary} rows={3} maxLength={4000} />
            <div className="grid gap-3 sm:grid-cols-2">
              <InputField label="Vereinbarte Maßnahme (optional)" placeholder="z. B. Zwei KV-Termine pro Woche" value={actionTitle} onChange={setActionTitle} />
              <DateInput label="Fällig bis" value={actionDue} onChange={setActionDue} />
            </div>
            <div><Button text="Gespräch speichern" onClick={saveSession} isDisabled={summary.trim().length < 3} isLoading={coaching.addSession.isPending} /></div>
          </div>
          <div className="flex flex-col gap-3 border-t border-color-border-light pt-3">
            <TextArea label="Notiz" value={note} onChange={setNote} rows={2} maxLength={4000} />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={privateNote} onChange={(e) => setPrivateNote(e.target.checked)} />
              Privat (nur für Sie und Ihre Führungskräfte, nicht für die Person)
            </label>
            <div>
              <Button text="Notiz speichern" variant="secondary" isDisabled={!note.trim()}
                onClick={async () => {
                  await coaching.addNote.mutateAsync({ visibility: privateNote ? "private_manager" : "shared", body: note });
                  setNote("");
                }} />
            </div>
          </div>
        </>
      )}
    </section>
  );
};
