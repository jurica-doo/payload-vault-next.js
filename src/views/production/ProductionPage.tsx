"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "../../components/button/Button";
import { DataTable } from "../../components/dataTable/DataTable";
import { StatusBadge, type StatusMap } from "../../components/statusBadge/StatusBadge";
import { ReasonConfirmForm } from "../../components/reasonConfirm/ReasonConfirmForm";
import { AeValue, MoneyValue, PointsValue } from "../../components/values/Values";
import { useModal } from "../../context/modal/ModalContext";
import { useBanner } from "../../context/banner/BannerContext";
import { usePermissions } from "../../hooks/permissions/usePermissions";
import { useStructure } from "../../hooks/useStructure/useStructure";
import { useProduction, type ProductionRow } from "../../hooks/useProduction/useProduction";
import { formatDate } from "../../utils/format";
import { ProductionForm } from "./ProductionForm";
import { ProductionDetails } from "./ProductionDetails";

export const productionStatus: StatusMap<"draft" | "submitted" | "eligible" | "cancelled"> = {
  draft: { label: "Entwurf", tone: "neutral" },
  submitted: { label: "Eingereicht", tone: "info" },
  eligible: { label: "Anrechenbar", tone: "success" },
  cancelled: { label: "Storniert", tone: "error" },
};

const PERIOD = { monthly: "mtl.", annual: "jährl.", one_off: "einm." } as const;

const action =
  "cursor-pointer rounded-radius-sm px-2 py-1 text-xs font-semibold text-color-text-accent hover:bg-color-primary/15 disabled:cursor-not-allowed disabled:opacity-40";

export const ProductionPage = () => {
  const { permissions } = usePermissions();
  const { openModal, closeModal } = useModal();
  const { showBanner } = useBanner();
  const [page, setPage] = useState(1);
  const { data, isLoading, error, save, submit, removeDraft, markEligible, cancel } = useProduction(page);
  const { data: structure } = useStructure();

  const isApprover = (permissions.isAdmin || permissions.isFinance) && permissions.hasMfa;
  const showProducer = permissions.isLeader || permissions.isAdmin || permissions.isFinance;
  const pickable = structure
    ? [...structure.byId.values()].map((r) => ({
        id: r.employee_id, first_name: r.first_name, last_name: r.last_name, employee_no: r.employee_no, status: r.status,
      }))
    : [];

  const run = async (fn: () => Promise<unknown>, success: string) => {
    try {
      await fn();
      showBanner("Erledigt", success, "success");
    } catch (e) {
      showBanner("Fehlgeschlagen", e instanceof Error ? e.message : "", "error");
    }
  };

  const openCreate = () =>
    openModal({
      title: "Produktion erfassen",
      size: "large",
      children: (
        <ProductionForm
          // Admins enter for anyone; everyone else for themselves.
          producerId={permissions.isAdmin && permissions.hasMfa ? null : (permissions.employeeId ?? null)}
          employees={pickable}
          onCancel={closeModal}
          onSubmit={async (input, submitNow) => {
            const id = await save.mutateAsync(input);
            if (submitNow) await submit.mutateAsync(id);
            closeModal();
            showBanner("Gespeichert", submitNow ? "Eingereicht zur Prüfung." : "Als Entwurf gespeichert.", "success");
          }}
        />
      ),
    });

  const openDetails = (row: ProductionRow) =>
    openModal({ title: `Produktion vom ${formatDate(row.production_date)}`, size: "large", children: <ProductionDetails record={row} /> });

  const openCancel = (row: ProductionRow) =>
    openModal({
      title: "Stornieren",
      children: (
        <ReasonConfirmForm
          message={
            row.status === "eligible"
              ? "Die Punkte werden mit einer Rückbuchung ausgeglichen. Die ursprüngliche Berechnung bleibt sichtbar."
              : "Der Datensatz wird als storniert markiert."
          }
          confirmText="Stornieren"
          variant="decline"
          onCancel={closeModal}
          onConfirm={async (reason) => {
            await cancel.mutateAsync({ id: row.id!, reason });
            closeModal();
            showBanner("Storniert", formatDate(row.production_date), "success");
          }}
        />
      ),
    });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-color-text-subtle">
          Punkte zählen, sobald ein Eintrag als anrechenbar bestätigt ist.
        </p>
        <div className="flex flex-wrap gap-2">
          {permissions.isAdmin && (
            <Link href="/vertrieb/produktion/import" className="self-center text-sm font-semibold">
              CSV-Import
            </Link>
          )}
          <Button text="Produktion erfassen" onClick={openCreate} isDisabled={!permissions.employeeId && !(permissions.isAdmin && permissions.hasMfa)} />
        </div>
      </div>

      <DataTable
        rows={data?.rows ?? []}
        getRowId={(r) => r.id!}
        caption="Produktion"
        isLoading={isLoading}
        error={error ? error.message : null}
        emptyMessage="Noch keine Produktion erfasst"
        onRowClick={openDetails}
        pagination={data ? { page, pageSize: data.pageSize, total: data.total, onPageChange: setPage } : undefined}
        columns={[
          { id: "date", header: "Datum", cell: (r) => formatDate(r.production_date) },
          ...(showProducer
            ? [{ id: "producer", header: "Person", cell: (r: ProductionRow) => `${r.producer_last_name}, ${r.producer_first_name}` }]
            : []),
          { id: "cat", header: "Sparte", cell: (r) => r.category_code },
          {
            id: "premium",
            header: "Beitrag",
            align: "right",
            hideOnMobile: true,
            cell: (r) => (
              <span>
                <MoneyValue value={r.premium_amount} />{" "}
                <span className="text-xs text-color-text-subtle">{PERIOD[r.premium_period as keyof typeof PERIOD]}</span>
              </span>
            ),
          },
          { id: "status", header: "Status", cell: (r) => <StatusBadge status={r.status ?? ""} map={productionStatus} /> },
          { id: "points", header: "Punkte", align: "right", cell: (r) => <PointsValue value={r.points} /> },
          { id: "ae", header: "AE", align: "right", hideOnMobile: true, cell: (r) => <AeValue value={r.ae} /> },
          {
            id: "actions",
            header: "",
            align: "right",
            cell: (r) => {
              const own = r.producer_id === permissions.employeeId;
              const canEdit = own || (permissions.isAdmin && permissions.hasMfa);
              return (
                // Buttons stop the row click so they don't also open the details.
                <span className="flex flex-wrap justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                  {r.status === "draft" && canEdit && (
                    <>
                      <button type="button" className={action} onClick={() => run(() => submit.mutateAsync(r.id!), "Eingereicht.")}>Einreichen</button>
                      <button type="button" className={action} onClick={() => run(() => removeDraft.mutateAsync(r.id!), "Entwurf gelöscht.")}>Löschen</button>
                    </>
                  )}
                  {r.status === "submitted" && isApprover && (
                    <button type="button" className={action} onClick={() => run(() => markEligible.mutateAsync(r.id!), "Als anrechenbar bestätigt.")}>Anrechenbar</button>
                  )}
                  {(r.status === "submitted" ? canEdit : r.status === "eligible" ? isApprover : false) && (
                    <button type="button" className={action} onClick={() => openCancel(r)}>Stornieren</button>
                  )}
                </span>
              );
            },
          },
        ]}
      />
    </div>
  );
};
