"use client";

import { errorText } from "../../utils/dbErrors";
import { MailIcon, PlusIcon, ShieldIcon } from "../../components/icons";
import { ButtonLink } from "../../components/button/ButtonLink";
import { PageActions } from "../../components/pageHeader/PageActions";
import { Tabs } from "../../components/tabs/Tabs";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "../../components/button/Button";
import { DataTable } from "../../components/dataTable/DataTable";
import { EmptyState } from "../../components/emptyState/EmptyState";
import { Notice } from "../../components/notice/Notice";
import { SearchBar } from "../../components/searchBar/SearchBar";
import { useBanner } from "../../context/banner/BannerContext";
import { useModal } from "../../context/modal/ModalContext";
import { usePermissions } from "../../hooks/permissions/usePermissions";
import { useStructure } from "../../hooks/useStructure/useStructure";
import { customerName, customerNo, useCustomers, type CustomerListItem } from "../../hooks/useCustomers/useCustomers";
import { formatDateTime, formatNumber } from "../../utils/format";
import { CUSTOMER_STATUS_LABEL, CustomerForm } from "./CustomerForm";

type Scope = "me" | "team" | "archived";

/** Customer list (§10.1): own customers, the structure's for leaders, all for admins/compliance. */
export const CustomersPage = () => {
  const { permissions } = usePermissions();
  const [query, setQuery] = useState("");
  const { data, isLoading, error } = useCustomers(query);
  const { data: structure } = useStructure();
  const { openModal, closeModal } = useModal();
  const { showBanner } = useBanner();
  const router = useRouter();
  const me = permissions.employeeId;
  const seesOthers = permissions.isLeader || permissions.isAdmin || permissions.isCompliance;
  const [scope, setScope] = useState<Scope>(me ? "me" : "team");

  if (!me && !permissions.isAdmin && !permissions.isCompliance) return <EmptyState message="Kunden gibt es nur für aktive Mitarbeitende." />;

  const all = data?.rows ?? [];
  const inScope = (c: CustomerListItem, s: Scope) =>
    s === "archived" ? Boolean(c.archived_at) : !c.archived_at && (s === "me" ? c.owner_id === me : c.owner_id !== me);
  const rows = all.filter((c) => inScope(c, scope));
  // Counters follow the search (P5-UX-09).
  const count = (s: Scope) => formatNumber(all.filter((c) => inScope(c, s)).length);
  const ownerName = (id: string) => {
    const r = structure?.byId.get(id);
    return r ? `${r.first_name} ${r.last_name}` : "–";
  };
  const scopes: { id: Scope; label: string }[] = [
    ...(me ? [{ id: "me" as const, label: `Meine Kunden (${count("me")})` }] : []),
    ...(seesOthers ? [{ id: "team" as const, label: `${!me ? "Alle" : permissions.isLeader ? "Team" : "Alle anderen"} (${count("team")})` }] : []),
    { id: "archived", label: `Archiviert (${count("archived")})` },
  ];
  const truncated = data !== undefined && data.total > all.length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs ariaLabel="Kunden-Ansicht" value={scope} onChange={setScope} items={scopes.map((s) => ({ value: s.id, label: s.label }))} />
        <PageActions>
          {(permissions.isCompliance || permissions.isAdmin) && <ButtonLink href="/vertrieb/kunden/kommunikation" text="Kommunikation" icon={MailIcon} />}
          {(permissions.isCompliance || permissions.isAdmin) && <ButtonLink href="/vertrieb/kunden/datenschutz" text="Datenschutz" icon={ShieldIcon} />}
          {me && (
            <Button text="Kunde anlegen" icon={PlusIcon} onClick={() => openModal({
              title: "Kunde anlegen", size: "large",
              children: <CustomerForm onDone={(id) => {
                closeModal();
                showBanner("Kunde angelegt", "Der Kunde ist gespeichert.", "success");
                router.push(`/vertrieb/kunden/${id}`);
              }} />,
            })} />
          )}
        </PageActions>
      </div>
      <SearchBar value={query} onChange={setQuery} debounceMs={300} placeholder="Name, Firma, K-Nummer, Telefon, E-Mail, PLZ" />
      {truncated && (
        <Notice tone="info" compact>
          Es werden {formatNumber(all.length)} von {formatNumber(data.total)} Kunden angezeigt. Bitte nutzen Sie die Suche, um weitere zu finden.
        </Notice>
      )}
      <DataTable
        rows={rows}
        isLoading={isLoading}
        error={error ? errorText(error) : null}
        getRowId={(c) => c.id}
        onRowClick={(c) => router.push(`/vertrieb/kunden/${c.id}`)}
        emptyMessage={query.trim() ? "Keine Kunden passen zur Suche" : "Keine Kunden in dieser Ansicht"}
        columns={[
          { id: "name", header: "Kunde", sortValue: (c: CustomerListItem) => customerName(c), cell: (c: CustomerListItem) => (
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
