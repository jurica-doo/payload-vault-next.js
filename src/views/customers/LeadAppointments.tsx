"use client";

import Link from "next/link";
import { useState } from "react";
import { useActivities } from "../../hooks/useActivities/useActivities";
import { formatDateTime } from "../../utils/format";

/**
 * After a lead became a customer, its appointments stay on the lead. The
 * upcoming ones are listed on the customer page so nobody misses them; the
 * outcome is recorded on the lead.
 */
export const LeadAppointments = ({ leadId }: { leadId: string }) => {
  const { data = [] } = useActivities({ linkedType: "lead", linkedId: leadId });
  // Time of the first render (pure render; a page visit is short enough).
  const [now] = useState(() => Date.now());
  const upcoming = data
    .filter((a) => a.type === "appointment" && !a.outcome && a.scheduled_at && new Date(a.scheduled_at).getTime() >= now - 2 * 3600_000)
    .sort((a, b) => (a.scheduled_at! < b.scheduled_at! ? -1 : 1));

  return (
    <div className="flex flex-col gap-1 text-xs text-color-text-subtle">
      {upcoming.length > 0 && (
        <div className="rounded-radius-md border border-color-border-light p-3 text-sm text-color-text-secondary">
          <p className="mb-1 font-semibold text-color-text-main">Offene Termine aus der Lead-Phase</p>
          <ul className="flex flex-col gap-1">
            {upcoming.map((a) => (
              <li key={a.id}>
                {formatDateTime(a.scheduled_at!)}
                {a.notes ? ` – ${a.notes}` : ""}
              </li>
            ))}
          </ul>
          <p className="mt-1 text-xs">
            Ergebnis (durchgeführt, abgesagt …) bitte <Link href={`/vertrieb/leads/${leadId}`}>beim Lead</Link> erfassen.
          </p>
        </div>
      )}
      <p>
        Frühere Aktivitäten als Lead: <Link href={`/vertrieb/leads/${leadId}`}>zum Lead</Link>
      </p>
    </div>
  );
};
