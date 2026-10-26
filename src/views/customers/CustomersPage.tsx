"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "../../components/button/Button";
import { DataTable } from "../../components/dataTable/DataTable";
import { EmptyState } from "../../components/emptyState/EmptyState";
import { useModal } from "../../context/modal/ModalContext";
import { usePermissions } from "../../hooks/permissions/usePermissions";
import { useStructure } from "../../hooks/useStructure/useStructure";
import { customerName, customerNo, useCustomers, type Customer } from "../../hooks/useCustomers/useCustomers";
import { formatDateTime } from "../../utils/format";
import { CUSTOMER_STATUS_LABEL, CustomerForm } from "./CustomerForm";

type Scope = "me" | "team" | "archived";

/** Customer list (§10.1): own customers, the structure's for leaders, all for admins/compliance. */
export const CustomersPage = () => {
  const { permissions } = usePermissions();
  const { data = [], isLoading, error } = useCustomers();
  const { data: structure } = useStructure();
  const { openModal, closeModal } = useModal();
  const router = useRouter();
  const me = permissions.employeeId;
  const seesOthers = permissions.isLeader || permissions.isAdmin || permissions.isCompliance;
  const [scope, setScope] = useState<Scope>(me ? "me" : "team");
  const [query, setQuery] = useState("");

  if (!me && !permissions.isAdmin && !permissions.isCompliance) return <EmptyState message="Kunden gibt es nur für aktive Mitarbeitende." />;

  const q = query.trim().toLowerCase();
  const rows = data.filter((c) => {
    if (scope === "archived" ? !c.archived_at : c.archived_at) return false;
    if (scope === "me" && c.owner_id !== me) return false;
    if (scope === "team" && c.owner_id === me) return false;
    return !q || c.search_name?.includes(q) || customerNo(c.customer_no).toLowerCase().includes(q)
      || (c.phone ?? "").includes(q.replace(/\s/g, "")) || (c.email ?? "").includes(q) || (c.postal_code ?? "").startsWith(q);
  });
  const ownerName = (id: string) => {
    const r = structure?.byId.get(id);
    return r ? `${r.first_name} ${r.last_name}` : "–";
  };
  const scopes: { id: Scope; label: string }[] = [
    ...(me ? [{ id: "me" as const, label: "Meine Kunden" }] : []),
    ...(seesOthers ? [{ id: "team" as const, label: me ? "Team" : "Alle" }] : []),
    { id: "archived", label: "Archiviert" },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" className="flex flex-wrap gap-2">
          {scopes.map((s) => (
            <button key={s.id} role="tab" aria-selected={scope === s.id} onClick={() => setScope(s.id)}
              className={`cursor-pointer rounded-full border px-3 py-1 text-sm ${scope === s.id ? "border-color-primary text-color-primary" : "border-color-border-light text-color-text-subtle"}`}>
              {s.label}
            </button>
          ))}
        </div>
        <span className="flex items-center gap-3">
        {(permissions.isCompliance || permissions.isAdmin) && <Link href="/vertrieb/kunden/datenschutz" className="text-sm font-semibold">Datenschutz</Link>}
        {me && (
          <Button text="Kunde anlegen" onClick={() => openModal({
            title: "Kunde anlegen", size: "large",
            children: <CustomerForm onDone={(id) => { closeModal(); router.push(`/vertrieb/kunden/${id}`); }} />,
          })} />
        )}
        </span>
      </div>
      <input type="search" aria-label="Suche" placeholder="Name, Firma, K-Nummer, Telefon, E-Mail, PLZ" value={query} onChange={(e) => setQuery(e.target.value)}
        className="rounded-lg border border-color-border-light bg-color-bg-dark px-3 py-2 text-sm" />
      <DataTable
        rows={rows}
        isLoading={isLoading}
        error={error ? error.message : null}
        getRowId={(c) => c.id}
        onRowClick={(c) => router.push(`/vertrieb/kunden/${c.id}`)}
        emptyMessage="Keine Kunden in dieser Ansicht"
        columns={[
          { id: "name", header: "Kunde", sortValue: (c: Customer) => customerName(c), cell: (c: Customer) => (
            <span><span className="font-semibold">{c.erased_at ? "Gelöscht (pseudonymisiert)" : customerName(c)}</span>
              <span className="block text-xs text-color-text-subtle">{customerNo(c.customer_no)}{c.city ? ` · ${c.city}` : ""}</span></span>
          ) },
          { id: "status", header: "Status", cell: (c) => CUSTOMER_STATUS_LABEL[c.status] ?? c.status },
          { id: "owner", header: "Betreuung", hideOnMobile: true, cell: (c) => ownerName(c.owner_id) },
          { id: "follow", header: "Nachfassen", sortValue: (c) => c.next_follow_up_at ?? "", cell: (c) => c.next_follow_up_at
            ? <span className={c.next_follow_up_at < new Date().toISOString() ? "text-color-error-text" : ""}>{formatDateTime(c.next_follow_up_at)}</span>
            : <span className="text-color-text-subtle">–</span> },
        ]}
      />
    </div>
  );
};
