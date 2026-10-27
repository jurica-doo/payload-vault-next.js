"use client";

import { useErrorToast } from "../../hooks/useErrorToast";
import { errorText } from "../../utils/dbErrors";
import { ActivityIcon, PlusIcon } from "../../components/icons";
import { ButtonLink } from "../../components/button/ButtonLink";
import { PageActions } from "../../components/pageHeader/PageActions";
import { Tabs } from "../../components/tabs/Tabs";
import { LoadingState } from "../../components/loadingState/LoadingState";
import Link from "next/link";
import { useState } from "react";
import { Button } from "../../components/button/Button";
import { DateInput, TextArea } from "../../components/formFields/FormFields";
import { InputField } from "../../components/inputField/InputField";
import { EmployeePicker } from "../../components/employeePicker/EmployeePicker";
import { EmptyState } from "../../components/emptyState/EmptyState";
import { StatusBadge, type StatusMap } from "../../components/statusBadge/StatusBadge";
import { useModal } from "../../context/modal/ModalContext";
import { useBanner } from "../../context/banner/BannerContext";
import { usePermissions } from "../../hooks/permissions/usePermissions";
import { useStructure } from "../../hooks/useStructure/useStructure";
import { useTasks, type Task } from "../../hooks/useTasks/useTasks";
import { berlinLocalToUtcIso, formatDate } from "../../utils/format";

export const TASK_TYPE_LABEL: Record<string, string> = {
  manual: "Aufgabe",
  goal_review: "Zielfreigabe",
  coaching_action: "Maßnahme",
  coaching_review: "Coaching",
  career_period_end: "Karriere",
  calculation_exception: "Prüffall",
  lead_first_contact: "Erstkontakt",
  lead_next_action: "Nächster Schritt",
  lead_unassigned: "Lead zuweisen",
  customer_service: "Kundenservice",
  customer_follow_up: "Kunde nachfassen",
  subsidy_review: "Zuschuss",
};

const LINK_FOR: Record<string, (id: string) => string> = {
  monthly_goal: () => "/vertrieb/ziele",
  coaching_action: () => "/vertrieb",
  employee: (id) => `/vertrieb/team/${id}`,
  exception: () => "/vertrieb/provisionen/abrechnung",
  lead: (id) => `/vertrieb/leads/${id}`,
  customer: (id) => `/vertrieb/kunden/${id}`,
};

const priority: StatusMap<"low" | "normal" | "high"> = {
  low: { label: "niedrig", tone: "neutral" },
  normal: { label: "normal", tone: "info" },
  high: { label: "hoch", tone: "warning" },
};

const nowIso = () => new Date().toISOString();

/** Partitions tasks for display: overdue first, then by due date. */
export function sortTasks(tasks: Task[], now = nowIso()) {
  const open = tasks.filter((t) => t.status === "open");
  const overdue = open.filter((t) => t.due_at && t.due_at < now);
  const upcoming = open.filter((t) => !t.due_at || t.due_at >= now);
  const byDue = (a: Task, b: Task) => (a.due_at ?? "9999").localeCompare(b.due_at ?? "9999");
  return { overdue: overdue.sort(byDue), upcoming: upcoming.sort(byDue), done: tasks.filter((t) => t.status !== "open") };
}

/** Shared task list (§11): own tasks, plus the team's for leaders. */
export const TasksPage = () => {
  const onFail = useErrorToast();
  const { permissions } = usePermissions();
  const { data = [], isLoading, setStatus } = useTasks();
  const { openModal, closeModal } = useModal();
  const [scope, setScope] = useState<"me" | "team">("me");
  const me = permissions.employeeId;
  if (!me) return <EmptyState message="Aufgaben gibt es nur für aktive Mitarbeitende." />;

  const visible = data.filter((t) => (scope === "me" ? t.owner_id === me : t.owner_id !== me));
  const { overdue, upcoming, done } = sortTasks(visible);

  const row = (t: Task) => {
    const link = t.linked_type && t.linked_id ? LINK_FOR[t.linked_type]?.(t.linked_id) : undefined;
    return (
      <li key={t.id} className="flex flex-wrap items-start justify-between gap-2 border-b border-color-border-light py-2 last:border-0">
        <label className="flex items-start gap-2">
          <input
            type="checkbox"
            className="mt-1"
            checked={t.status === "done"}
            disabled={t.status === "cancelled"}
            onChange={(e) => setStatus.mutate({ id: t.id, status: e.target.checked ? "done" : "open" }, { onError: onFail("Aufgabe nicht aktualisiert") })}
          />
          <span>
            <span className={`text-sm ${t.status !== "open" ? "line-through text-color-text-subtle" : "text-color-text-main"}`}>{t.title}</span>
            <span className="block text-xs text-color-text-subtle">
              {TASK_TYPE_LABEL[t.type] ?? t.type}
              {t.due_at && ` · fällig ${formatDate(t.due_at.slice(0, 10))}`}
              {t.completion_note && ` · ${t.completion_note}`}
            </span>
          </span>
        </label>
        <span className="flex items-center gap-2">
          {t.priority !== "normal" && <StatusBadge status={t.priority} map={priority} />}
          {link && <Link href={link} className="text-xs font-semibold">Öffnen</Link>}
        </span>
      </li>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {permissions.isLeader ? (
          <Tabs
            ariaLabel="Aufgaben-Ansicht"
            value={scope}
            onChange={setScope}
            items={[
              { value: "me", label: "Meine Aufgaben" },
              { value: "team", label: "Team" },
            ]}
          />
        ) : <span />}
        <PageActions>
          <ButtonLink href="/vertrieb/aufgaben/aktivitaeten" text="Aktivitäten & Termine" icon={ActivityIcon} />
          <Button text="Aufgabe anlegen" icon={PlusIcon} onClick={() => openModal({ title: "Aufgabe anlegen", children: <TaskForm onDone={closeModal} /> })} />
        </PageActions>
      </div>

      {isLoading ? <LoadingState /> : (
        <>
          {overdue.length > 0 && (
            <section className="rounded-radius-lg border border-color-error-border/40 bg-color-bg-error-subtle p-3">
              <h2 className="text-sm font-semibold text-color-error-text">Überfällig ({overdue.length})</h2>
              <ul>{overdue.map(row)}</ul>
            </section>
          )}
          <section className="ui-card p-3">
            <h2 className="text-sm font-semibold">Offen ({upcoming.length})</h2>
            {upcoming.length === 0 && overdue.length === 0 ? <p className="py-2 text-sm text-color-text-subtle">Keine offenen Aufgaben.</p> : <ul>{upcoming.map(row)}</ul>}
          </section>
          {done.length > 0 && (
            <details className="ui-card p-3">
              <summary className="cursor-pointer text-sm font-semibold">Erledigt / geschlossen ({done.length})</summary>
              <ul>{done.slice(0, 50).map(row)}</ul>
            </details>
          )}
        </>
      )}
    </div>
  );
};

const TaskForm = ({ onDone }: { onDone: () => void }) => {
  const { permissions } = usePermissions();
  const { data: structure } = useStructure();
  const { create } = useTasks();
  const { showBanner } = useBanner();
  const [owner, setOwner] = useState<string | null | undefined>(permissions.employeeId ?? undefined);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [due, setDue] = useState("");
  const [prio, setPrio] = useState("normal");
  const people = structure
    ? [...structure.byId.values()].filter((r) => r.status === "active").map((r) => ({ id: r.employee_id, first_name: r.first_name, last_name: r.last_name, employee_no: r.employee_no }))
    : [];

  return (
    <form className="flex flex-col gap-3 pt-2" onSubmit={async (e) => {
      e.preventDefault();
      if (!owner || title.trim().length < 3) return;
      try {
        await create.mutateAsync({ ownerId: owner, title, description, dueAt: due ? berlinLocalToUtcIso(due, "17:00") : null, priority: prio });
        showBanner("Aufgabe angelegt", title, "success");
        onDone();
      } catch (err) {
        showBanner("Nicht gespeichert", errorText(err), "error");
      }
    }}>
      <InputField label="Titel" placeholder="z. B. Unterlagen anfordern" value={title} onChange={setTitle} isRequired />
      {permissions.isLeader && people.length > 1 && <EmployeePicker label="Zuständig" employees={people} value={owner} onChange={setOwner} />}
      <div className="grid gap-3 sm:grid-cols-2">
        <DateInput label="Fällig am" value={due} onChange={setDue} />
        <label className="flex flex-col gap-1 text-[14px] font-semibold text-color-text-secondary">
          Priorität
          <select value={prio} onChange={(e) => setPrio(e.target.value)} className="ui-input">
            <option value="low">niedrig</option><option value="normal">normal</option><option value="high">hoch</option>
          </select>
        </label>
      </div>
      <TextArea label="Beschreibung" value={description} onChange={setDescription} rows={3} />
      <div><Button type="submit" text="Speichern" isLoading={create.isPending} isDisabled={title.trim().length < 3} /></div>
    </form>
  );
};
