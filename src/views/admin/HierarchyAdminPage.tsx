"use client";

import { useState } from "react";
import { Button } from "../../components/button/Button";
import { DateInput, TextArea } from "../../components/formFields/FormFields";
import { EmployeePicker } from "../../components/employeePicker/EmployeePicker";
import { MfaRequiredNotice } from "../../components/mfa/MfaRequiredNotice";
import { ReasonConfirmForm, MIN_REASON_LENGTH } from "../../components/reasonConfirm/ReasonConfirmForm";
import { StatusBadge } from "../../components/statusBadge/StatusBadge";
import { useModal } from "../../context/modal/ModalContext";
import { useBanner } from "../../context/banner/BannerContext";
import { usePermissions } from "../../hooks/permissions/usePermissions";
import { useEmployees } from "../../hooks/useEmployees/useEmployees";
import { useAssignments } from "../../hooks/useStructure/useStructure";
import { formatDate } from "../../utils/format";

const berlinToday = () =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date());

/**
 * Reporting-line changes (§5.1): effective-dated, with a reason, never
 * rewriting history. Planned (future) transfers can be called off.
 */
export const HierarchyAdminPage = () => {
  const { permissions } = usePermissions();
  const { openModal, closeModal } = useModal();
  const { showBanner } = useBanner();
  const { data: employees = [] } = useEmployees();
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [managerId, setManagerId] = useState<string | null | undefined>(undefined);
  const [effectiveFrom, setEffectiveFrom] = useState(berlinToday());
  const [reason, setReason] = useState("");
  const [formError, setFormError] = useState<string>();
  const { data: history = [], isLoading, assign, cancelFuture } = useAssignments(employeeId);

  const canWrite = permissions.isAdmin && permissions.hasMfa;
  const today = berlinToday();
  const nameOf = (id: string | null) => {
    if (!id) return "Keine (Spitze der Struktur)";
    const e = employees.find((x) => x.id === id);
    return e ? `${e.last_name}, ${e.first_name}` : "Unbekannt";
  };

  const submit = async () => {
    if (!employeeId) return setFormError("Bitte zuerst eine Person wählen.");
    if (managerId === undefined) return setFormError("Bitte die neue Führungskraft wählen.");
    if (reason.trim().length < MIN_REASON_LENGTH) return setFormError(`Bitte eine Begründung mit mindestens ${MIN_REASON_LENGTH} Zeichen angeben.`);
    setFormError(undefined);
    try {
      await assign.mutateAsync({ managerId, effectiveFrom, reason });
      setReason("");
      setManagerId(undefined);
      showBanner("Gespeichert", `Neue Zuordnung ab ${formatDate(effectiveFrom)}.`, "success");
    } catch (e) {
      setFormError(e instanceof Error ? e.message : undefined);
    }
  };

  const openCancel = (assignmentId: string, from: string) =>
    openModal({
      title: "Geplanten Wechsel absagen",
      children: (
        <ReasonConfirmForm
          message={`Der zum ${formatDate(from)} geplante Wechsel wird gelöscht; die vorherige Zuordnung gilt weiter.`}
          confirmText="Absagen"
          variant="decline"
          onCancel={closeModal}
          onConfirm={async (r) => {
            await cancelFuture.mutateAsync({ assignmentId, reason: r });
            closeModal();
            showBanner("Abgesagt", "Der geplante Wechsel wurde entfernt.", "success");
          }}
        />
      ),
    });

  return (
    <div className="flex flex-col gap-4">
      {permissions.isAdmin && !permissions.hasMfa && <MfaRequiredNotice />}

      <section className="flex flex-col gap-3 rounded-radius-lg bg-color-bg-card p-4 shadow-shadow-soft">
        <EmployeePicker
          label="Person"
          employees={employees}
          value={employeeId ?? undefined}
          onChange={(id) => {
            setEmployeeId(id);
            setManagerId(undefined);
            setFormError(undefined);
          }}
        />
      </section>

      {employeeId && (
        <>
          <section className="flex flex-col gap-3 rounded-radius-lg bg-color-bg-card p-4 shadow-shadow-soft">
            <h2 className="text-base font-semibold">Neue Zuordnung</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <EmployeePicker
                label="Führungskraft ab Stichtag"
                employees={employees.filter((e) => e.status !== "inactive")}
                excludeIds={[employeeId]}
                noneLabel="Keine (Spitze der Struktur)"
                value={managerId}
                onChange={setManagerId}
              />
              <DateInput label="Gültig ab" value={effectiveFrom} onChange={setEffectiveFrom} hint="Frühere Daten verändern keine Historie – das System lehnt sie ab." />
            </div>
            <TextArea label="Begründung" value={reason} onChange={setReason} maxLength={500} isRequired />
            {formError && (
              <p role="alert" className="text-sm font-medium text-color-error-text">
                {formError}
              </p>
            )}
            <div>
              <Button text="Zuordnung speichern" onClick={submit} isLoading={assign.isPending} isDisabled={!canWrite} />
            </div>
          </section>

          <section className="rounded-radius-lg bg-color-bg-card p-4 shadow-shadow-soft">
            <h2 className="mb-3 text-base font-semibold">Verlauf</h2>
            {isLoading ? (
              <p className="text-sm">Lädt…</p>
            ) : history.length === 0 ? (
              <p className="text-sm text-color-text-subtle">Noch keine Zuordnung.</p>
            ) : (
              <ol className="flex flex-col gap-3">
                {history.map((a) => {
                  const planned = a.effective_from > today;
                  const current = !planned && (a.effective_to === null || a.effective_to > today);
                  return (
                    <li key={a.id} className="flex flex-wrap items-start justify-between gap-2 border-b border-color-border-light pb-3 text-sm last:border-0">
                      <div>
                        <p className="font-semibold text-color-text-main">{nameOf(a.manager_id)}</p>
                        <p className="text-xs">
                          {formatDate(a.effective_from)} – {a.effective_to ? formatDate(a.effective_to) : "offen"}
                        </p>
                        {a.change_reason && <p className="text-xs text-color-text-secondary">{a.change_reason}</p>}
                      </div>
                      <span className="flex items-center gap-2">
                        {planned && <StatusBadge status="planned" map={{ planned: { label: "Geplant", tone: "warning" } }} />}
                        {current && <StatusBadge status="current" map={{ current: { label: "Aktuell", tone: "success" } }} />}
                        {planned && a.effective_to === null && (
                          <button
                            type="button"
                            disabled={!canWrite}
                            onClick={() => openCancel(a.id, a.effective_from)}
                            className="cursor-pointer rounded-radius-sm px-2 py-1 text-xs font-semibold text-color-error-text hover:bg-color-error/10 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            Absagen
                          </button>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
        </>
      )}
    </div>
  );
};
