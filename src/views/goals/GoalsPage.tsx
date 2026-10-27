"use client";

import { Tabs } from "../../components/tabs/Tabs";
import { LoadingState } from "../../components/loadingState/LoadingState";
import { useState } from "react";
import { Button } from "../../components/button/Button";
import { DecimalInput, TextArea } from "../../components/formFields/FormFields";
import { ReasonConfirmForm } from "../../components/reasonConfirm/ReasonConfirmForm";
import { StatusBadge, type StatusMap } from "../../components/statusBadge/StatusBadge";
import { EmptyState } from "../../components/emptyState/EmptyState";
import { useModal } from "../../context/modal/ModalContext";
import { useBanner } from "../../context/banner/BannerContext";
import { usePermissions } from "../../hooks/permissions/usePermissions";
import { useGoals, type Goal, type GoalTargets } from "../../hooks/useGoals/useGoals";
import { parseGermanDecimal } from "../../utils/format";

export const goalStatus: StatusMap<"draft" | "submitted" | "approved" | "returned"> = {
  draft: { label: "Entwurf", tone: "neutral" },
  submitted: { label: "Zur Freigabe", tone: "info" },
  approved: { label: "Freigegeben", tone: "success" },
  returned: { label: "Zurückgegeben", tone: "warning" },
};

export const GOAL_FIELDS = [
  { key: "points", label: "Punkte", decimals: true },
  { key: "kv_points", label: "davon KV-Punkte", decimals: true },
  { key: "appointments_booked", label: "Termine vereinbart" },
  { key: "appointments_held", label: "Termine durchgeführt" },
  { key: "offers", label: "Angebote" },
  { key: "sales", label: "Abschlüsse" },
  { key: "followups", label: "Nachfassaktionen" },
  { key: "expected_gross", label: "Erwartete Produktion (€)", decimals: true },
] as const;

const MONTHS = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
const monthLabel = (iso: string) => `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
const nextMonths = () => {
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date());
  const [y, m] = today.split("-").map(Number);
  return [0, 1, 2].map((i) => {
    const d = new Date(Date.UTC(y, m - 1 + i, 1));
    return d.toISOString().slice(0, 10);
  });
};
const toInput = (v: unknown) => (v === undefined || v === null ? "" : String(v).replace(".", ","));

/** Monthly goals (§7.2): own goals for this and the next two months, plus team review for leaders. */
export const GoalsPage = () => {
  const { permissions } = usePermissions();
  const { data = [], isLoading } = useGoals();
  const months = nextMonths();
  const [month, setMonth] = useState(months[0]);
  const own = data.find((g) => g.employee_id === permissions.employeeId && g.month === month);
  const toReview = data.filter((g) => g.status === "submitted" && g.employee_id !== permissions.employeeId);

  if (!permissions.employeeId) return <EmptyState message="Ziele gibt es nur für aktive Mitarbeitende." />;

  return (
    <div className="flex flex-col gap-4">
      <Tabs
        ariaLabel="Monat"
        value={month}
        onChange={setMonth}
        items={months.map((m) => ({ value: m, label: monthLabel(m) }))}
      />

      {isLoading ? <LoadingState label="Ziele werden geladen…" /> : <GoalEditor key={`${month}-${own?.updated_at ?? "new"}`} month={month} goal={own} />}

      {toReview.length > 0 && <ReviewList goals={toReview} />}
    </div>
  );
};

const GoalEditor = ({ month, goal }: { month: string; goal: Goal | undefined }) => {
  const { saveDraft, submit } = useGoals();
  const { showBanner } = useBanner();
  const source = (goal?.status === "draft" || !goal ? goal?.draft : goal?.submitted_targets ?? goal?.draft) as GoalTargets | undefined;
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(GOAL_FIELDS.map((f) => [f.key, toInput(source?.[f.key])])),
  );
  const [devGoal, setDevGoal] = useState(source?.development_goal ?? "");
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string>();
  const locked = goal?.status === "submitted";

  const collect = (): GoalTargets | null => {
    const out: GoalTargets = {};
    for (const f of GOAL_FIELDS) {
      const raw = values[f.key].trim();
      if (raw === "") continue;
      const parsed = parseGermanDecimal(raw);
      if (parsed === null) {
        setError(`„${f.label}“ ist keine Zahl.`);
        return null;
      }
      out[f.key] = parsed;
    }
    if (devGoal.trim()) out.development_goal = devGoal.trim();
    return out;
  };

  const save = async (andSubmit: boolean) => {
    setError(undefined);
    const targets = collect();
    if (!targets) return;
    try {
      const id = await saveDraft.mutateAsync({ month, targets });
      if (andSubmit) await submit.mutateAsync({ goalId: id, comment });
      showBanner(andSubmit ? "Eingereicht" : "Gespeichert", monthLabel(month), "success");
    } catch (e) {
      setError(e instanceof Error ? e.message : undefined);
    }
  };

  return (
    <section className="flex flex-col gap-4 ui-card p-4 sm:p-5">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Meine Ziele · {monthLabel(month)}</h2>
        <span className="flex items-center gap-2">
          {goal?.late && <span className="text-xs text-color-secondary">nach Monatsbeginn eingereicht</span>}
          {goal && <StatusBadge status={goal.status ?? "draft"} map={goalStatus} />}
        </span>
      </header>
      {goal?.status === "returned" && goal.last_review_comment && (
        <p role="note" className="rounded-radius-md border border-color-secondary/40 bg-color-secondary/10 px-3 py-2 text-sm">
          Rückmeldung: {goal.last_review_comment}
        </p>
      )}
      <p className="text-xs text-color-text-subtle">Monatsziele sind Planwerte und keine Karriereschwellen.</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {GOAL_FIELDS.map((f) => (
          <DecimalInput
            key={f.key}
            label={f.label}
            value={values[f.key]}
            onChange={(v) => setValues((s) => ({ ...s, [f.key]: v }))}
            isReadOnly={locked}
          />
        ))}
      </div>
      <TextArea label="Entwicklungsziel / Trainingsfokus" value={devGoal} onChange={setDevGoal} maxLength={500} rows={2} isReadOnly={locked} />
      {!locked && <TextArea label="Kommentar zur Einreichung (optional)" value={comment} onChange={setComment} rows={2} />}
      {error && <p role="alert" className="text-sm text-color-error-text">{error}</p>}
      {locked ? (
        <p className="text-sm text-color-text-subtle">Wartet auf Freigabe durch die Führungskraft.</p>
      ) : (
        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" text="Entwurf speichern" onClick={() => save(false)} isLoading={saveDraft.isPending} />
          <Button text="Einreichen" onClick={() => save(true)} isLoading={submit.isPending} />
        </div>
      )}
    </section>
  );
};

const ReviewList = ({ goals }: { goals: Goal[] }) => {
  const { review } = useGoals();
  const { openModal, closeModal } = useModal();
  const { showBanner } = useBanner();

  const decide = async (g: Goal, decision: "approved" | "returned", comment = "") => {
    await review.mutateAsync({ goalId: g.id!, decision, comment });
    showBanner(decision === "approved" ? "Freigegeben" : "Zurückgegeben", `${g.employee_name} · ${monthLabel(g.month!)}`, "success");
  };

  return (
    <section className="ui-card p-4 sm:p-5">
      <h2 className="mb-3 text-lg font-semibold">Zur Freigabe ({goals.length})</h2>
      <ul className="flex flex-col gap-3">
        {goals.map((g) => {
          const t = (g.submitted_targets ?? {}) as GoalTargets;
          return (
            <li key={g.id} className="flex flex-wrap items-start justify-between gap-3 border-b border-color-border-light pb-3 last:border-0">
              <div className="text-sm">
                <p className="font-semibold text-color-text-main">{g.employee_name} · {monthLabel(g.month!)}{g.late ? " · verspätet" : ""}</p>
                <p className="text-color-text-secondary">
                  {GOAL_FIELDS.filter((f) => t[f.key] !== undefined).map((f) => `${f.label}: ${toInput(t[f.key])}`).join(" · ") || "–"}
                </p>
                {t.development_goal && <p className="text-xs">Entwicklung: {t.development_goal}</p>}
              </div>
              <span className="flex gap-2">
                <Button size="small" text="Freigeben" onClick={() => decide(g, "approved")} />
                <Button
                  size="small"
                  variant="secondary"
                  text="Zurückgeben"
                  onClick={() =>
                    openModal({
                      title: "Ziel zurückgeben",
                      children: (
                        <ReasonConfirmForm
                          message={`Bitte erklären Sie ${g.employee_name}, was angepasst werden soll.`}
                          reasonLabel="Rückmeldung"
                          minLength={3}
                          confirmText="Zurückgeben"
                          onCancel={closeModal}
                          onConfirm={async (c) => {
                            await decide(g, "returned", c);
                            closeModal();
                          }}
                        />
                      ),
                    })
                  }
                />
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
};
