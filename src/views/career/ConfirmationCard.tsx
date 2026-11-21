"use client";

import { ProgressMeter } from "../../components/progressMeter/ProgressMeter";
import { StatusBadge, type StatusMap } from "../../components/statusBadge/StatusBadge";
import type { Confirmation } from "../../hooks/useCareer/useCareer";
import { levelShort } from "../../domain/rules";
import { formatDate } from "../../utils/format";

/** German labels for the confirmation states (shared with Beförderungen). */
export const CONFIRMATION_STATUS: StatusMap<Confirmation["status"]> = {
  pending: { label: "noch nicht begonnen", tone: "neutral" },
  running: { label: "läuft", tone: "info" },
  met: { label: "bestätigt", tone: "success" },
  missed: { label: "verfehlt – Entscheidung ausstehend", tone: "warning" },
  kept: { label: "Stufe beibehalten", tone: "success" },
  demoted: { label: "zurückgestuft", tone: "error" },
};

/**
 * Confirmation year after a promotion (Anlage 2): at least 80 % of the new
 * level's points in the 12 full months after the promotion month.
 */
export const ConfirmationCard = ({ confirmation: c }: { confirmation: Confirmation }) => (
  <section className="flex flex-col gap-3 ui-card p-4 sm:p-5" aria-label="Bestätigungsjahr">
    <header className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-base font-semibold">Bestätigungsjahr {levelShort(c.level)}</h2>
      <StatusBadge status={c.status} map={CONFIRMATION_STATUS} />
    </header>
    <p className="text-sm">
      Befördert am {formatDate(c.promoted_on)} · gezählt vom {formatDate(c.start)} bis {formatDate(c.end)}
    </p>
    {c.status === "demoted" || c.status === "kept" ? (
      <p className="text-sm text-color-text-secondary">
        {c.status === "demoted"
          ? `Die Geschäftsleitung hat zurückgestuft auf ${levelShort(c.demoted_to ?? "")}.`
          : "Die Geschäftsleitung hat entschieden, die Stufe beizubehalten."}
      </p>
    ) : (
      <ProgressMeter label="Punkte im Bestätigungsjahr (80 % der Schwelle)" achieved={c.achieved} required={c.required} />
    )}
    <p className="text-xs text-color-text-subtle">
      Nach einer Beförderung müssen in den 12 vollen Monaten danach mindestens 80 % der Punkte der neuen Stufe erreicht
      werden (eigene Produktion und ganze Struktur, ohne 50-%-Regel). Wird das Ziel verfehlt, kann die Geschäftsleitung
      auf die vorherige Stufe zurückstufen.
    </p>
  </section>
);
