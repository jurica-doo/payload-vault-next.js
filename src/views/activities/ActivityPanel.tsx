"use client";

import { useState } from "react";
import { Button } from "../../components/button/Button";
import { DateInput, TextArea } from "../../components/formFields/FormFields";
import { InputField } from "../../components/inputField/InputField";
import { StatusBadge, type StatusMap } from "../../components/statusBadge/StatusBadge";
import { useBanner } from "../../context/banner/BannerContext";
import { useActivities, type Activity, type ActivityFilter, type ActivityType, type AppointmentOutcome } from "../../hooks/useActivities/useActivities";
import { berlinLocalToUtcIso, berlinToday, formatDateTime } from "../../utils/format";

export const ACTIVITY_TYPE_LABEL: Record<ActivityType, string> = {
  contact_attempt: "Kontaktversuch",
  call: "Anruf",
  email: "E-Mail",
  appointment: "Termin",
  offer: "Angebot",
  followup: "Nachfassen",
  note: "Notiz",
};

const OUTCOME: StatusMap<string> = {
  reached: { label: "erreicht", tone: "success" },
  not_reached: { label: "nicht erreicht", tone: "neutral" },
  held: { label: "durchgeführt", tone: "success" },
  no_show: { label: "nicht erschienen", tone: "error" },
  cancelled: { label: "abgesagt", tone: "neutral" },
  rescheduled: { label: "verschoben", tone: "warning" },
};

/** Appointment state shown to users: booked until an outcome is set. */
export function appointmentState(a: Pick<Activity, "type" | "outcome" | "scheduled_at">, now = new Date().toISOString()) {
  if (a.type !== "appointment") return null;
  if (a.outcome) return a.outcome;
  return a.scheduled_at && a.scheduled_at < now ? "awaiting_outcome" : "booked";
}

/**
 * Activity log with a quick-entry form. Shared by the activities page, the
 * lead detail and (Phase 5) the customer profile: pass `linkedType/linkedId`
 * to scope it to one record.
 */
export const ActivityPanel = ({ filter = {}, canLog = true }: { filter?: ActivityFilter; canLog?: boolean }) => {
  const { data = [], isLoading, setOutcome } = useActivities(filter);
  const { showBanner } = useBanner();
  const now = new Date().toISOString();

  const outcomeButtons = (a: Activity) => {
    const future = Boolean(a.scheduled_at && a.scheduled_at > now);
    const options: AppointmentOutcome[] = future ? ["cancelled", "rescheduled"] : ["held", "no_show", "cancelled", "rescheduled"];
    return (
      <span className="flex flex-wrap gap-1">
        {options.map((o) => (
          <button key={o} type="button" disabled={setOutcome.isPending}
            className="cursor-pointer rounded-full border border-color-border-light px-2 py-0.5 text-xs hover:border-color-primary"
            onClick={() => setOutcome.mutate({ id: a.id, outcome: o }, { onError: (e) => showBanner("Nicht gespeichert", e.message, "error") })}>
            {OUTCOME[o].label}
          </button>
        ))}
      </span>
    );
  };

  return (
    <div className="flex flex-col gap-3">
      {canLog && <ActivityForm filter={filter} />}
      {isLoading ? <p className="text-sm">Lädt…</p> : data.length === 0 ? (
        <p className="text-sm text-color-text-subtle">Noch keine Aktivitäten.</p>
      ) : (
        <ul className="flex flex-col">
          {data.map((a) => {
            const state = appointmentState(a, now);
            return (
              <li key={a.id} className="flex flex-wrap items-start justify-between gap-2 border-b border-color-border-light py-2 last:border-0">
                <span className="text-sm">
                  <span className="font-semibold">{ACTIVITY_TYPE_LABEL[a.type as ActivityType] ?? a.type}</span>
                  <span className="text-color-text-subtle"> · {formatDateTime(a.type === "appointment" ? a.scheduled_at : a.occurred_at)}</span>
                  {a.notes && <span className="block text-xs text-color-text-secondary">{a.notes}</span>}
                </span>
                <span className="flex flex-wrap items-center gap-2">
                  {a.outcome && <StatusBadge status={a.outcome} map={OUTCOME} />}
                  {state === "booked" && <StatusBadge status="booked" map={{ booked: { label: "vereinbart", tone: "info" } }} />}
                  {state === "awaiting_outcome" && <StatusBadge status="open" map={{ open: { label: "Ergebnis fehlt", tone: "warning" } }} />}
                  {(state === "booked" || state === "awaiting_outcome") && outcomeButtons(a)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

const TYPES_FOR_FORM: ActivityType[] = ["contact_attempt", "call", "appointment", "offer", "followup", "email", "note"];

const ActivityForm = ({ filter }: { filter: ActivityFilter }) => {
  const { log } = useActivities(filter);
  const { showBanner } = useBanner();
  const [type, setType] = useState<ActivityType>("contact_attempt");
  const [date, setDate] = useState(berlinToday());
  const [time, setTime] = useState("");
  const [outcome, setOutcomeValue] = useState("");
  const [notes, setNotes] = useState("");
  const isAppointment = type === "appointment";
  const hasReach = type === "contact_attempt" || type === "call" || type === "email";

  return (
    <form className="flex flex-col gap-3 rounded-radius-md border border-color-border-light p-3" onSubmit={async (e) => {
      e.preventDefault();
      if (isAppointment && (!date || !time)) return;
      const at = date ? berlinLocalToUtcIso(date, time || "12:00") : null;
      try {
        await log.mutateAsync({
          type,
          // Logging today without a time means "now"; an appointment needs its slot.
          occurredAt: isAppointment || (date === berlinToday() && !time) ? null : at,
          scheduledAt: isAppointment ? at : null,
          outcome: hasReach && outcome ? outcome : null,
          notes,
        });
        setNotes(""); setOutcomeValue(""); setTime("");
      } catch (err) {
        showBanner("Nicht gespeichert", err instanceof Error ? err.message : "", "error");
      }
    }}>
      <div className="grid gap-3 sm:grid-cols-4">
        <label className="flex flex-col gap-1 text-[14px] font-semibold text-color-text-secondary">
          Art
          <select value={type} onChange={(e) => setType(e.target.value as ActivityType)} className="rounded-lg border border-color-border-light bg-color-bg-dark px-3 py-3 text-color-text-main">
            {TYPES_FOR_FORM.map((t) => <option key={t} value={t}>{ACTIVITY_TYPE_LABEL[t]}</option>)}
          </select>
        </label>
        <DateInput label={isAppointment ? "Termin am" : "Datum"} value={date} onChange={setDate} max={isAppointment ? undefined : berlinToday()} isRequired />
        <InputField label={isAppointment ? "Uhrzeit" : "Uhrzeit (optional)"} placeholder="14:30" value={time} onChange={setTime} isRequired={isAppointment} />
        {hasReach ? (
          <label className="flex flex-col gap-1 text-[14px] font-semibold text-color-text-secondary">
            Ergebnis
            <select value={outcome} onChange={(e) => setOutcomeValue(e.target.value)} className="rounded-lg border border-color-border-light bg-color-bg-dark px-3 py-3 text-color-text-main">
              <option value="">–</option><option value="reached">erreicht</option><option value="not_reached">nicht erreicht</option>
            </select>
          </label>
        ) : <span />}
      </div>
      <TextArea label="Notiz" value={notes} onChange={setNotes} rows={2} />
      <div><Button type="submit" text="Erfassen" isLoading={log.isPending} isDisabled={isAppointment && !/^\d{1,2}:\d{2}$/.test(time)} /></div>
    </form>
  );
};
