"use client";

import { Button } from "../../components/button/Button";
import { DataTable } from "../../components/dataTable/DataTable";
import { ReasonConfirmForm } from "../../components/reasonConfirm/ReasonConfirmForm";
import { SectionHeading } from "../../components/sectionHeading/SectionHeading";
import { StatusBadge } from "../../components/statusBadge/StatusBadge";
import { PointsValue } from "../../components/values/Values";
import { useBanner } from "../../context/banner/BannerContext";
import { useModal } from "../../context/modal/ModalContext";
import { levelShort } from "../../domain/rules";
import { useConfirmationQueue, type ConfirmationEntry } from "../../hooks/useCareer/useCareer";
import { errorText } from "../../utils/dbErrors";
import { formatDate } from "../../utils/format";
import { CONFIRMATION_STATUS } from "../career/ConfirmationCard";

const ORDER: Record<ConfirmationEntry["status"], number> = { missed: 0, running: 1, pending: 2, met: 3, kept: 4, demoted: 5 };

/**
 * Confirmation years (Anlage 2): everyone promoted in the last year. After a
 * missed year (below 80 % of the new level's points) the management decides:
 * keep the level or go back one step (commission from the next month).
 */
export const ConfirmationQueue = () => {
  const { openModal, closeModal } = useModal();
  const { showBanner } = useBanner();
  const { data = [], isLoading, error, decide } = useConfirmationQueue(true);
  const rows = [...data].sort((a, b) => ORDER[a.status] - ORDER[b.status] || a.end.localeCompare(b.end));

  const openDecision = (c: ConfirmationEntry, demote: boolean) =>
    openModal({
      title: demote ? "Zurückstufen" : "Stufe beibehalten",
      children: (
        <ReasonConfirmForm
          message={
            demote
              ? `${c.name} wird ab heute von ${levelShort(c.level)} auf ${levelShort(c.previous_level ?? "")} zurückgestuft. Die Provision folgt ab dem nächsten Monat; die Person wird benachrichtigt.`
              : `${c.name} bleibt ${levelShort(c.level)}, obwohl das Bestätigungsjahr verfehlt wurde. Die Person wird benachrichtigt.`
          }
          confirmText={demote ? "Zurückstufen" : "Beibehalten"}
          variant={demote ? "decline" : "primary"}
          onCancel={closeModal}
          onConfirm={async (reason) => {
            await decide.mutateAsync({ employeeId: c.employee_id, demote, reason });
            closeModal();
            showBanner(demote ? "Zurückgestuft" : "Stufe beibehalten", c.name, "success");
          }}
        />
      ),
    });

  return (
    <section className="flex flex-col gap-3">
      <SectionHeading description="Nach einer Beförderung: mindestens 80 % der Punkte der neuen Stufe in den 12 vollen Monaten danach. Gilt nicht für VD+ und GM.">
        Bestätigungsjahr
      </SectionHeading>
      <DataTable
        rows={rows}
        getRowId={(c) => c.promotion_id}
        caption="Bestätigungsjahre"
        isLoading={isLoading}
        error={error ? errorText(error) : null}
        emptyMessage="Derzeit läuft kein Bestätigungsjahr."
        columns={[
          { id: "name", header: "Name", cell: (c) => `${c.name} (${c.employee_no})`, sortValue: (c) => c.name },
          { id: "level", header: "Stufe", cell: (c) => `${levelShort(c.level)} seit ${formatDate(c.promoted_on)}` },
          { id: "window", header: "Zeitraum", hideOnMobile: true, cell: (c) => `${formatDate(c.start)} – ${formatDate(c.end)}` },
          { id: "points", header: "Punkte", align: "right", cell: (c) => <><PointsValue value={c.achieved} /> / {Number(c.required)}</> },
          { id: "status", header: "Status", cell: (c) => <StatusBadge status={c.status} map={CONFIRMATION_STATUS} /> },
          {
            id: "action",
            header: "",
            align: "right",
            cell: (c) =>
              c.status === "missed" ? (
                <div className="flex justify-end gap-2">
                  <Button text="Beibehalten" size="small" variant="secondary" onClick={() => openDecision(c, false)} />
                  {c.previous_level && (
                    <Button text="Zurückstufen" size="small" variant="danger" onClick={() => openDecision(c, true)} />
                  )}
                </div>
              ) : null,
          },
        ]}
      />
    </section>
  );
};
