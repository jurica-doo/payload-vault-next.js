"use client";

import Link from "next/link";
import { Select } from "../../components/select/Select";
import { errorText } from "../../utils/dbErrors";
import { ActionMenu } from "../../components/actionMenu/ActionMenu";
import { ErrorBlock } from "../../components/errorBlock/ErrorBlock";
import { LoadingState } from "../../components/loadingState/LoadingState";
import { ModalActions } from "../../components/modal/ModalActions";
import { Notice } from "../../components/notice/Notice";
import { Pagination } from "../../components/pagination/Pagination";
import { usePagination } from "../../components/pagination/usePagination";
import { useState } from "react";
import { Button } from "../../components/button/Button";
import { DateInput, TextArea, TimeInput } from "../../components/formFields/FormFields";
import { StatusBadge, type StatusMap } from "../../components/statusBadge/StatusBadge";
import { useBanner } from "../../context/banner/BannerContext";
import { useModal } from "../../context/modal/ModalContext";
import {
  ACTIVITY_LIMIT, useActivities, useLinkedLeadNames,
  type Activity, type ActivityFilter, type ActivityType, type AppointmentOutcome,
} from "../../hooks/useActivities/useActivities";
import { leadName, leadNo } from "../../hooks/useLeads/useLeads";
import { berlinLocalToUtcIso, berlinToday, formatDateTime, formatNumber } from "../../utils/format";

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

/** Outcomes an appointment can get now: held / no-show only once the slot has passed. */
export function allowedOutcomes(a: Pick<Activity, "scheduled_at">, now = new Date().toISOString()): AppointmentOutcome[] {
  return a.scheduled_at && a.scheduled_at > now ? ["cancelled", "rescheduled"] : ["held", "no_show", "cancelled", "rescheduled"];
}

/**
 * Activity log with a quick-entry form. Shared by the activities page, the
 * lead detail and (Phase 5) the customer profile: pass `linkedType/linkedId`
 * to scope it to one record.
 */
export const ActivityPanel = ({ filter = {}, canLog = true }: { filter?: ActivityFilter; canLog?: boolean }) => {
  const { data = [], isLoading, error, refetch, setOutcome } = useActivities(filter);
  const { pageItems, pagination } = usePagination(data, { resetKey: JSON.stringify(filter) });
  // On lists that aren't scoped to one lead, each row names its lead (P4-UX-03).
  const showLead = filter.linkedType !== "lead";
  const { data: leads } = useLinkedLeadNames(
    showLead ? pageItems.filter((a) => a.linked_type === "lead" && a.linked_id).map((a) => a.linked_id as string) : [],
  );
  const { showBanner } = useBanner();
  const { openModal, closeModal } = useModal();
  const now = new Date().toISOString();

  const applyOutcome = (a: Activity, o: AppointmentOutcome) => {
    if (o === "rescheduled") {
      openModal({ title: "Termin verschieben", children: <RescheduleForm appointment={a} filter={filter} onDone={closeModal} /> });
      return;
    }
    setOutcome.mutate({ id: a.id, outcome: o }, {
      onSuccess: () => showBanner("Ergebnis gespeichert", `Termin: ${OUTCOME[o].label}.`, "success"),
      onError: (e) => showBanner("Ergebnis nicht gespeichert", errorText(e), "error"),
    });
  };

  const outcomeButtons = (a: Activity) => (
    <span className="flex flex-wrap gap-1">
      {allowedOutcomes(a, now).map((o) => (
        <button key={o} type="button" disabled={setOutcome.isPending}
          className="pressable cursor-pointer rounded-full border border-color-border-light px-2 py-0.5 text-xs hover:border-color-primary disabled:cursor-not-allowed disabled:opacity-50"
          onClick={() => applyOutcome(a, o)}>
          {OUTCOME[o].label}
        </button>
      ))}
    </span>
  );

  return (
    <div className="flex flex-col gap-3">
      {canLog && <ActivityForm filter={filter} />}
      {isLoading ? <LoadingState /> : error ? (
        <ErrorBlock variant="inline" message={errorText(error, "Die Aktivitäten konnten nicht geladen werden.")} onRetry={() => refetch()} />
      ) : data.length === 0 ? (
        <p className="text-sm text-color-text-subtle">Noch keine Aktivitäten.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {data.length >= ACTIVITY_LIMIT && (
            <Notice tone="info" compact>Es werden die neuesten {formatNumber(ACTIVITY_LIMIT)} Aktivitäten angezeigt.</Notice>
          )}
          <ul className="flex flex-col">
            {pageItems.map((a) => {
              const state = appointmentState(a, now);
              const lead = showLead && a.linked_type === "lead" && a.linked_id ? leads?.get(a.linked_id) : undefined;
              const canCorrect = a.type === "appointment" && a.outcome !== null && a.scheduled_at !== null && a.scheduled_at <= now;
              return (
                <li key={a.id} className="flex flex-wrap items-start justify-between gap-2 border-b border-color-border-light py-2 last:border-0">
                  <span className="text-sm">
                    <span className="font-semibold">{ACTIVITY_TYPE_LABEL[a.type as ActivityType] ?? a.type}</span>
                    <span className="text-color-text-subtle"> · {formatDateTime(a.type === "appointment" ? a.scheduled_at : a.occurred_at)}</span>
                    {lead && (
                      <Link href={`/vertrieb/leads/${lead.id}`} className="block text-xs font-semibold">
                        Lead: {leadName(lead)} ({leadNo(lead.lead_no)})
                      </Link>
                    )}
                    {a.notes && <span className="block whitespace-pre-line text-xs text-color-text-secondary">{a.notes}</span>}
                  </span>
                  <span className="flex flex-wrap items-center gap-2">
                    {a.outcome && <StatusBadge status={a.outcome} map={OUTCOME} />}
                    {state === "booked" && <StatusBadge status="booked" map={{ booked: { label: "vereinbart", tone: "info" } }} />}
                    {state === "awaiting_outcome" && <StatusBadge status="open" map={{ open: { label: "Ergebnis fehlt", tone: "warning" } }} />}
                    {(state === "booked" || state === "awaiting_outcome") && outcomeButtons(a)}
                    {canCorrect && (
                      // A late arrival turns "nicht erschienen" into "durchgeführt" (P4-UX-08).
                      <ActionMenu label="Ergebnis ändern" items={(["held", "no_show", "cancelled"] as const)
                        .filter((o) => o !== a.outcome)
                        .map((o) => ({ label: `Ergebnis: ${OUTCOME[o].label}`, onClick: () => applyOutcome(a, o) }))} />
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
          <Pagination {...pagination} />
        </div>
      )}
    </div>
  );
};

/** "verschoben" marks the old slot and books the new one in one step (P4-UX-05). */
const RescheduleForm = ({ appointment, filter, onDone }: { appointment: Activity; filter: ActivityFilter; onDone: () => void }) => {
  const { log, setOutcome } = useActivities(filter);
  const { showBanner } = useBanner();
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [error, setError] = useState<string>();
  const busy = log.isPending || setOutcome.isPending;
  return (
    <form className="flex flex-col gap-3 pt-2" onSubmit={async (e) => {
      e.preventDefault();
      setError(undefined);
      try {
        const at = berlinLocalToUtcIso(date, time);
        await setOutcome.mutateAsync({ id: appointment.id, outcome: "rescheduled" });
        await log.mutateAsync({
          type: "appointment", scheduledAt: at, notes: appointment.notes ?? "", ownerId: appointment.owner_id,
          linkedType: appointment.linked_type, linkedId: appointment.linked_id,
        });
        showBanner("Termin verschoben", `Neuer Termin: ${formatDateTime(at)}.`, "success");
        onDone();
      } catch (err) {
        setError(errorText(err));
      }
    }}>
      <p className="text-sm text-color-text-secondary">
        Der bisherige Termin ({formatDateTime(appointment.scheduled_at)}) wird als „verschoben“ markiert und der neue gebucht.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <DateInput label="Neuer Termin am" value={date} onChange={setDate} min={berlinToday()} isRequired />
        <TimeInput label="Uhrzeit" value={time} onChange={setTime} isRequired />
      </div>
      {error && <p role="alert" className="text-sm text-color-error-text">{error}</p>}
      <ModalActions>
        <Button text="Abbrechen" variant="secondary" onClick={onDone} />
        <Button type="submit" text="Verschieben" isLoading={busy} isDisabled={!date || !time} />
      </ModalActions>
    </form>
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
      if (!date || (isAppointment && !time)) return;
      try {
        // Inside the try: an invalid date/time is a German message, not a crash (P4-UI-05).
        const at = berlinLocalToUtcIso(date, time || "12:00");
        await log.mutateAsync({
          type,
          // Logging today without a time means "now"; an appointment needs its slot.
          occurredAt: isAppointment || (date === berlinToday() && !time) ? null : at,
          scheduledAt: isAppointment ? at : null,
          outcome: hasReach && outcome ? outcome : null,
          notes,
        });
        showBanner("Aktivität erfasst", `${ACTIVITY_TYPE_LABEL[type]}${isAppointment ? ` am ${formatDateTime(at)}` : ""}.`, "success");
        setNotes(""); setOutcomeValue(""); setTime("");
      } catch (err) {
        showBanner("Aktivität nicht erfasst", errorText(err), "error");
      }
    }}>
      <div className="grid gap-3 sm:grid-cols-4">
        <Select
          label="Art"
          value={type}
          onChange={(v) => setType(v as ActivityType)}
          options={TYPES_FOR_FORM.map((t) => ({ value: t, label: ACTIVITY_TYPE_LABEL[t] }))}
          fullWidth
        />
        <DateInput label={isAppointment ? "Termin am" : "Datum"} value={date} onChange={setDate} max={isAppointment ? undefined : berlinToday()} isRequired />
        <TimeInput label={isAppointment ? "Uhrzeit" : "Uhrzeit (optional)"} value={time} onChange={setTime} isRequired={isAppointment} />
        {hasReach ? (
          <Select
            label="Ergebnis"
            value={outcome}
            onChange={setOutcomeValue}
            options={[{ value: "", label: "–" }, { value: "reached", label: "erreicht" }, { value: "not_reached", label: "nicht erreicht" }]}
            fullWidth
          />
        ) : <span />}
      </div>
      <TextArea label="Notiz" value={notes} onChange={setNotes} rows={2} hint={notes.length > 3500 ? `${notes.length}/4.000 Zeichen` : undefined} />
      <div><Button type="submit" text="Erfassen" isLoading={log.isPending} isDisabled={!date || (isAppointment && !time) || notes.length > 4000} /></div>
    </form>
  );
};
