"use client";

import { DataTable } from "../../components/dataTable/DataTable";
import { MfaRequiredNotice } from "../../components/mfa/MfaRequiredNotice";
import { ReasonConfirmForm } from "../../components/reasonConfirm/ReasonConfirmForm";
import { PointsValue } from "../../components/values/Values";
import { useModal } from "../../context/modal/ModalContext";
import { useBanner } from "../../context/banner/BannerContext";
import { usePermissions } from "../../hooks/permissions/usePermissions";
import { usePromotionQueue, type QueueEntry } from "../../hooks/useCareer/useCareer";

/**
 * Promotion queue (OD-15: promotions are approved, not automatic). The
 * database re-checks the qualification at approval time and stores the
 * calculation as evidence in the level history.
 */
export const PromotionsAdminPage = () => {
  const { permissions } = usePermissions();
  const { openModal, closeModal } = useModal();
  const { showBanner } = useBanner();
  const canWrite = permissions.isAdmin && permissions.hasMfa;
  const { data = [], isLoading, error, approve } = usePromotionQueue(canWrite);

  if (!canWrite) {
    return (
      <div className="flex flex-col gap-4">
        <MfaRequiredNotice />
        <p className="text-sm text-color-text-subtle">Die Warteschlange wird nach der Bestätigung angezeigt.</p>
      </div>
    );
  }

  const openApprove = (q: QueueEntry) =>
    openModal({
      title: "Beförderung freigeben",
      children: (
        <ReasonConfirmForm
          message={`${q.name} wird ab heute ${q.target}. Die Berechnung wird als Nachweis gespeichert; die Punkte für die nächste Stufe beginnen neu.`}
          confirmText={`Zu ${q.target} befördern`}
          onCancel={closeModal}
          onConfirm={async (reason) => {
            const level = await approve.mutateAsync({ employeeId: q.employee_id, reason });
            closeModal();
            showBanner("Befördert", `${q.name}: ${level}`, "success");
          }}
        />
      ),
    });

  return (
    <DataTable
      rows={data}
      getRowId={(q) => q.employee_id}
      caption="Qualifizierte Mitarbeitende"
      isLoading={isLoading}
      error={error ? error.message : null}
      emptyMessage="Derzeit ist niemand qualifiziert."
      columns={[
        { id: "name", header: "Name", cell: (q) => `${q.name} (${q.employee_no})`, sortValue: (q) => q.name },
        { id: "step", header: "Stufe", cell: (q) => `${q.level} → ${q.target}` },
        { id: "points", header: "Punkte", align: "right", cell: (q) => <><PointsValue value={q.eligible} /> / {Number(q.required)}</> },
        { id: "kv", header: "KV", align: "right", cell: (q) => <><PointsValue value={q.eligible_kv} isKv /> / {Number(q.kv_required)}</> },
        {
          id: "action",
          header: "",
          align: "right",
          cell: (q) => (
            <button
              type="button"
              onClick={() => openApprove(q)}
              className="cursor-pointer rounded-radius-sm px-2 py-1 text-xs font-semibold text-color-text-accent hover:bg-color-primary/15"
            >
              Freigeben
            </button>
          ),
        },
      ]}
    />
  );
};
