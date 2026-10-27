"use client";

import { ChartBarIcon, PlusIcon } from "../../components/icons";
import { ButtonLink } from "../../components/button/ButtonLink";
import { PageActions } from "../../components/pageHeader/PageActions";
import { Tabs } from "../../components/tabs/Tabs";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Button } from "../../components/button/Button";
import { DataTable } from "../../components/dataTable/DataTable";
import { EmptyState } from "../../components/emptyState/EmptyState";
import { StatusBadge, type StatusMap } from "../../components/statusBadge/StatusBadge";
import { useModal } from "../../context/modal/ModalContext";
import { usePermissions } from "../../hooks/permissions/usePermissions";
import { useStructure } from "../../hooks/useStructure/useStructure";
import { leadName, leadNo, useLeadConfig, useLeads, type Lead } from "../../hooks/useLeads/useLeads";
import { slaState, type SlaState } from "../../domain/leads";
import { formatDate, formatDateTime } from "../../utils/format";
import { LeadForm } from "./LeadForm";

export const SLA_BADGE: StatusMap<SlaState> = {
  met: { label: "rechtzeitig", tone: "success" },
  late_met: { label: "verspätet", tone: "warning" },
  open: { label: "offen", tone: "info" },
  overdue: { label: "überfällig", tone: "error" },
  none: { label: "–", tone: "neutral" },
};

type Scope = "me" | "team" | "pool" | "closed";

/** Lead list (§9): own leads, the structure's leads and the pool for leaders. */
export const LeadsPage = () => {
  const { permissions } = usePermissions();
  const { data = [], isLoading, error } = useLeads();
  const { data: config } = useLeadConfig();
  const { data: structure } = useStructure();
  const { openModal, closeModal } = useModal();
  const router = useRouter();
  const [scope, setScope] = useState<Scope>("me");
  const [stage, setStage] = useState("");
  const [query, setQuery] = useState("");
  const me = permissions.employeeId;

  const stageOf = useMemo(() => new Map((config?.stages ?? []).map((s) => [s.code, s])), [config]);
  const sourceOf = useMemo(() => new Map((config?.sources ?? []).map((s) => [s.id, s.name])), [config]);
  const ownerName = (id: string | null) => {
    if (!id) return "Pool";
    const r = structure?.byId.get(id);
    return r ? `${r.first_name} ${r.last_name}` : "–";
  };

  if (!me) return <EmptyState message="Leads gibt es nur für aktive Mitarbeitende." />;

  const isClosed = (l: Lead) => ["won", "lost"].includes(stageOf.get(l.stage)?.kind ?? "");
  const q = query.trim().toLowerCase();
  const rows = data.filter((l) => {
    if (scope === "closed" ? !isClosed(l) : isClosed(l)) return false;
    if (scope === "me" && l.owner_id !== me) return false;
    if (scope === "team" && (l.owner_id === me || l.owner_id === null)) return false;
    if (scope === "pool" && l.owner_id !== null) return false;
    if (stage && l.stage !== stage) return false;
    return !q || l.search_name?.includes(q) || leadNo(l.lead_no).toLowerCase().includes(q) || (l.phone ?? "").includes(q.replace(/\s/g, ""));
  });
  const counts = {
    me: data.filter((l) => l.owner_id === me && !isClosed(l)).length,
    team: data.filter((l) => l.owner_id && l.owner_id !== me && !isClosed(l)).length,
    pool: data.filter((l) => !l.owner_id && !isClosed(l)).length,
  };
  const scopes: { id: Scope; label: string }[] = [
    { id: "me", label: `Meine (${counts.me})` },
    ...(permissions.isLeader || permissions.isAdmin ? [
      { id: "team" as const, label: `Team (${counts.team})` },
      { id: "pool" as const, label: `Nicht zugewiesen (${counts.pool})` },
    ] : []),
    { id: "closed", label: "Abgeschlossen" },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs ariaLabel="Lead-Ansicht" value={scope} onChange={setScope} items={scopes.map((s) => ({ value: s.id, label: s.label }))} />
        <PageActions>
          {(permissions.isLeader || permissions.isAdmin) && (
            <ButtonLink href="/vertrieb/leads/analyse" text="Auswertung" icon={ChartBarIcon} />
          )}
          <Button text="Lead anlegen" icon={PlusIcon} onClick={() => openModal({
            title: "Lead anlegen", size: "large",
            children: <LeadForm onDone={(id) => { closeModal(); router.push(`/vertrieb/leads/${id}`); }} />,
          })} />
        </PageActions>
      </div>
      <div className="flex flex-wrap gap-3">
        <input type="search" aria-label="Suche" placeholder="Name, Firma, L-Nummer, Telefon" value={query} onChange={(e) => setQuery(e.target.value)}
          className="min-w-60 flex-1 ui-input" />
        <select aria-label="Phase" value={stage} onChange={(e) => setStage(e.target.value)}
          className="ui-input">
          <option value="">Alle Phasen</option>
          {(config?.stages ?? []).map((s) => <option key={s.code} value={s.code}>{s.name_de}</option>)}
        </select>
      </div>
      <DataTable
        rows={rows}
        isLoading={isLoading}
        error={error ? error.message : null}
        getRowId={(l) => l.id}
        onRowClick={(l) => router.push(`/vertrieb/leads/${l.id}`)}
        emptyMessage="Keine Leads in dieser Ansicht"
        columns={[
          { id: "name", header: "Lead", sortValue: (l) => leadName(l), cell: (l) => (
            <span><span className="font-semibold">{leadName(l)}</span><span className="block text-xs text-color-text-subtle">{leadNo(l.lead_no)}{l.company && l.first_name ? ` · ${l.company}` : ""}</span></span>
          ) },
          { id: "stage", header: "Phase", sortValue: (l) => stageOf.get(l.stage)?.position ?? 0, cell: (l) => stageOf.get(l.stage)?.name_de ?? l.stage },
          { id: "owner", header: "Zuständig", hideOnMobile: true, cell: (l) => ownerName(l.owner_id) },
          { id: "source", header: "Quelle", hideOnMobile: true, cell: (l) => sourceOf.get(l.source_id) ?? "–" },
          { id: "received", header: "Eingang", hideOnMobile: true, sortValue: (l) => l.received_at, cell: (l) => formatDate(l.received_at.slice(0, 10)) },
          { id: "sla", header: "Erstkontakt", sortValue: (l) => l.sla_due_at ?? "", cell: (l) => {
            const s = slaState(l);
            return <span title={l.sla_due_at ? `fällig bis ${formatDateTime(l.sla_due_at)}` : undefined}><StatusBadge status={s} map={SLA_BADGE} /></span>;
          } },
          { id: "next", header: "Nächster Schritt", hideOnMobile: true, sortValue: (l) => l.next_action_at ?? "", cell: (l) => (
            l.next_action_at ? <span className={l.next_action_at < new Date().toISOString() ? "text-color-error-text" : ""}>{formatDateTime(l.next_action_at)}{l.next_action ? ` · ${l.next_action}` : ""}</span> : <span className="text-color-text-subtle">–</span>
          ) },
        ]}
      />
    </div>
  );
};
