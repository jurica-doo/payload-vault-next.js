"use client";

import { useState } from "react";
import { Button } from "../../components/button/Button";
import { DataTable } from "../../components/dataTable/DataTable";
import { StatusBadge, type StatusMap } from "../../components/statusBadge/StatusBadge";
import { ReasonConfirmForm } from "../../components/reasonConfirm/ReasonConfirmForm";
import { MfaRequiredNotice } from "../../components/mfa/MfaRequiredNotice";
import { SearchBar } from "../../components/searchBar/SearchBar";
import { useModal } from "../../context/modal/ModalContext";
import { useBanner } from "../../context/banner/BannerContext";
import { useAuth } from "../../context/AuthContext";
import { usePermissions } from "../../hooks/permissions/usePermissions";
import { useEmployees, type AppRole, type EmployeeWithRoles } from "../../hooks/useEmployees/useEmployees";
import { formatDate } from "../../utils/format";
import { EmployeeCreateForm } from "./EmployeeCreateForm";

const statusMap: StatusMap<"invited" | "active" | "inactive"> = {
  invited: { label: "Eingeladen", tone: "info" },
  active: { label: "Aktiv", tone: "success" },
  inactive: { label: "Inaktiv", tone: "neutral" },
};

const ROLE_LABELS: Record<AppRole, string> = {
  admin: "Administration",
  finance: "Finanzen",
  compliance: "Datenschutz/Compliance",
};

const actionClass =
  "cursor-pointer rounded-radius-sm px-2 py-1 text-xs font-semibold text-color-text-accent hover:bg-color-primary/15 disabled:cursor-not-allowed disabled:opacity-40";

export const EmployeesAdminPage = () => {
  const { openModal, closeModal } = useModal();
  const { showBanner } = useBanner();
  const { user } = useAuth();
  const { permissions } = usePermissions();
  const { data = [], isLoading, error, createEmployee, resendInvite, setActive, setRole } = useEmployees();
  const [search, setSearch] = useState("");
  const canWrite = permissions.isAdmin && permissions.hasMfa;

  const needle = search.trim().toLowerCase();
  const rows = needle
    ? data.filter((e) =>
        [e.first_name, e.last_name, e.email, e.employee_no].some((v) => v.toLowerCase().includes(needle)),
      )
    : data;

  const openCreate = () =>
    openModal({
      title: "Mitarbeitende anlegen",
      size: "large",
      children: (
        <EmployeeCreateForm
          onCancel={closeModal}
          onSubmit={async (input) => {
            const result = await createEmployee.mutateAsync(input);
            closeModal();
            if (result.inviteError) {
              showBanner("Angelegt, Einladung fehlgeschlagen", result.inviteError, "error");
            } else {
              showBanner(
                "Angelegt",
                result.needs_invite
                  ? `Einladung an ${input.email} versendet.`
                  : "Bestehendes Konto verknüpft – keine Einladung nötig.",
                "success",
              );
            }
          }}
        />
      ),
    });

  const openStatusChange = (employee: EmployeeWithRoles) => {
    const activate = employee.status === "inactive";
    openModal({
      title: activate ? "Reaktivieren" : "Deaktivieren",
      children: (
        <ReasonConfirmForm
          message={
            activate
              ? `${employee.first_name} ${employee.last_name} erhält wieder Zugriff auf den Vertriebsbereich.`
              : `${employee.first_name} ${employee.last_name} verliert sofort den Zugriff auf alle Vertriebsdaten. Historie und Zuordnungen bleiben erhalten.`
          }
          confirmText={activate ? "Reaktivieren" : "Deaktivieren"}
          variant={activate ? "primary" : "decline"}
          onCancel={closeModal}
          onConfirm={async (reason) => {
            await setActive.mutateAsync({ employeeId: employee.id, active: activate, reason });
            closeModal();
            showBanner(activate ? "Reaktiviert" : "Deaktiviert", `${employee.first_name} ${employee.last_name}`, "success");
          }}
        />
      ),
    });
  };

  const openRoleChange = (employee: EmployeeWithRoles, role: AppRole) => {
    if (!employee.user_id) return;
    const grant = !employee.roles.includes(role);
    openModal({
      title: grant ? "Rolle vergeben" : "Rolle entziehen",
      children: (
        <ReasonConfirmForm
          message={`${ROLE_LABELS[role]} für ${employee.first_name} ${employee.last_name} ${grant ? "vergeben" : "entziehen"}.`}
          confirmText={grant ? "Vergeben" : "Entziehen"}
          variant={grant ? "primary" : "decline"}
          onCancel={closeModal}
          onConfirm={async (reason) => {
            await setRole.mutateAsync({ userId: employee.user_id!, role, grant, reason });
            closeModal();
            showBanner("Rollen aktualisiert", `${employee.first_name} ${employee.last_name}`, "success");
          }}
        />
      ),
    });
  };

  const resend = async (employee: EmployeeWithRoles) => {
    try {
      await resendInvite.mutateAsync(employee.id);
      showBanner("Einladung versendet", employee.email, "success");
    } catch (e) {
      showBanner("Einladung fehlgeschlagen", e instanceof Error ? e.message : "", "error");
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {permissions.isAdmin && !permissions.hasMfa && <MfaRequiredNotice />}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="w-full sm:w-80">
          <SearchBar value={search} onChange={setSearch} placeholder="Name, E-Mail oder Personalnummer" />
        </div>
        <Button text="Mitarbeitende anlegen" onClick={openCreate} isDisabled={!canWrite} />
      </div>

      <DataTable
        rows={rows}
        getRowId={(e) => e.id}
        caption="Mitarbeitende"
        isLoading={isLoading}
        error={error ? error.message : null}
        emptyMessage={needle ? "Keine Treffer" : "Noch keine Mitarbeitenden angelegt"}
        columns={[
          {
            id: "name",
            header: "Name",
            cell: (e) => (
              <span>
                <span className="font-semibold">{e.last_name}, {e.first_name}</span>
                <span className="block text-xs text-color-text-subtle">{e.email}</span>
              </span>
            ),
            sortValue: (e) => `${e.last_name} ${e.first_name}`,
          },
          { id: "no", header: "Pers.-Nr.", cell: (e) => e.employee_no, sortValue: (e) => e.employee_no, hideOnMobile: true },
          { id: "start", header: "Start", cell: (e) => formatDate(e.start_date), sortValue: (e) => e.start_date, hideOnMobile: true },
          {
            id: "status",
            header: "Status",
            cell: (e) => (
              <span className="inline-flex flex-col items-start gap-1">
                <StatusBadge status={e.status} map={statusMap} />
                {e.status === "invited" && !e.openInvite && (
                  <span className="text-xs text-color-error-text">Einladung abgelaufen</span>
                )}
              </span>
            ),
            sortValue: (e) => e.status,
          },
          {
            id: "roles",
            header: "Rollen",
            cell: (e) =>
              e.user_id ? (
                <span className="flex flex-wrap gap-1">
                  {(Object.keys(ROLE_LABELS) as AppRole[]).map((role) => (
                    <button
                      key={role}
                      type="button"
                      disabled={!canWrite}
                      aria-pressed={e.roles.includes(role)}
                      onClick={() => openRoleChange(e, role)}
                      className={`cursor-pointer rounded-full border px-2 py-0.5 text-xs disabled:cursor-not-allowed disabled:opacity-60 ${
                        e.roles.includes(role)
                          ? "border-color-primary bg-color-bg-accent-subtle text-color-text-accent"
                          : "border-dashed border-color-border-light text-color-text-subtle"
                      }`}
                    >
                      {ROLE_LABELS[role]}
                    </button>
                  ))}
                </span>
              ) : (
                <span className="text-xs text-color-text-subtle">nach Annahme</span>
              ),
          },
          {
            id: "actions",
            header: "Aktionen",
            cell: (e) => (
              <span className="flex flex-wrap justify-end gap-1">
                {e.status === "invited" && !e.user_id && (
                  <button type="button" className={actionClass} disabled={!canWrite || resendInvite.isPending} onClick={() => resend(e)}>
                    Einladung senden
                  </button>
                )}
                {e.user_id !== user?.id && (
                  <button type="button" className={actionClass} disabled={!canWrite} onClick={() => openStatusChange(e)}>
                    {e.status === "inactive" ? "Reaktivieren" : "Deaktivieren"}
                  </button>
                )}
              </span>
            ),
            align: "right",
          },
        ]}
      />
    </div>
  );
};
