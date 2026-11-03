"use client";

import { Select } from "../../components/select/Select";
import { errorText } from "../../utils/dbErrors";
import { ChartBarIcon, PlusIcon } from "../../components/icons";
import { ButtonLink } from "../../components/button/ButtonLink";
import { PageActions } from "../../components/pageHeader/PageActions";
import { Tabs } from "../../components/tabs/Tabs";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { Button } from "../../components/button/Button";
import { DataTable } from "../../components/dataTable/DataTable";
import { EmptyState } from "../../components/emptyState/EmptyState";
import { Notice } from "../../components/notice/Notice";
import { SearchBar } from "../../components/searchBar/SearchBar";
import { StatusBadge, type StatusMap } from "../../components/statusBadge/StatusBadge";
import { useModal } from "../../context/modal/ModalContext";
import { useBanner } from "../../context/banner/BannerContext";
import { usePermissions } from "../../hooks/permissions/usePermissions";
import { useStructure } from "../../hooks/useStructure/useStructure";
import { leadName, leadNo, useLeadConfig, useLeads, type LeadListItem } from "../../hooks/useLeads/useLeads";
import { slaState, type SlaState } from "../../domain/leads";
import { formatDate, formatDateTime, formatNumber } from "../../utils/format";
import { LeadForm } from "./LeadForm";

export const SLA_BADGE: StatusMap<SlaState> = {
  met: { label: "rechtzeitig", tone: "success" },
  late_met: { label: "verspätet", tone: "warning" },
  open: { label: "offen", tone: "info" },
  overdue: { label: "überfällig", tone: "error" },
  none: { label: "–", tone: "neutral" },
};

type Scope = "me" | "team" | "pool" | "closed";

/** URL value of each view (`?ansicht=`), so notifications can link to a filtered list. */
const SCOPE_PARAM: Record<Scope, string> = { me: "meine", team: "team", pool: "pool", closed: "abgeschlossen" };
const scopeFromParam = (value: string | null): Scope =>
  (Object.entries(SCOPE_PARAM).find(([, v]) => v === value)?.[0] as Scope | undefined) ?? "me";

/** Lead list (§9): own leads, the structure's leads and the pool for leaders. */
export const LeadsPage = () => {
  const { permissions } = usePermissions();
  const params = useSearchParams();
  const [scope, setScope] = useState<Scope>(() => scopeFromParam(params.get("ansicht")));
  const [onlyOverdue, setOnlyOverdue] = useState(() => params.get("sla") === "overdue");
  const [stage, setStage] = useState("");
  const [query, setQuery] = useState("");
  const { data, isLoading, error } = useLeads({ search: query, stage });
  const { data: config } = useLeadConfig();
  const { data: structure } = useStructure();
  const { openModal, closeModal } = useModal();
  const { showBanner } = useBanner();
  const router = useRouter();
  const me = permissions.employeeId;
  const canSeeOthers = permissions.isLeader || permissions.isAdmin;

  const stageOf = useMemo(() => new Map((config?.stages ?? []).map((s) => [s.code, s])), [config]);
  const sourceOf = useMemo(() => new Map((config?.sources ?? []).map((s) => [s.id, s.name])), [config]);
  const ownerName = (id: string | null) => {
    if (!id) return "Pool";
    const r = structure?.byId.get(id);
    return r ? `${r.first_name} ${r.last_name}` : "–";
  };

  if (!me) return <EmptyState message="Leads gibt es nur für aktive Mitarbeitende." />;

  const all = data?.rows ?? [];
  const isClosed = (l: LeadListItem) => ["won", "lost"].includes(stageOf.get(l.stage)?.kind ?? "");
  // Counters follow the active search, phase and SLA filters (P4-UX-02).
  const filtered = onlyOverdue ? all.filter((l) => slaState(l) === "overdue") : all;
  const inScope = (l: LeadListItem, s: Scope) =>
    s === "closed" ? isClosed(l)
      : !isClosed(l) && (s === "me" ? l.owner_id === me : s === "team" ? l.owner_id !== null && l.owner_id !== me : l.owner_id === null);
  const rows = filtered.filter((l) => inScope(l, scope));
  const count = (s: Scope) => formatNumber(filtered.filter((l) => inScope(l, s)).length);
  const scopes: { id: Scope; label: string }[] = [
    { id: "me", label: `Meine (${count("me")})` },
    ...(canSeeOthers ? [
      // For an admin who leads nobody the second tab is everyone else, not a team.
      { id: "team" as const, label: `${permissions.isLeader ? "Team" : "Alle anderen"} (${count("team")})` },
      { id: "pool" as const, label: `Nicht zugewiesen (${count("pool")})` },
    ] : []),
    { id: "closed", label: `Abgeschlossen (${count("closed")})` },
  ];
  const truncated = data !== undefined && data.total > all.length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs ariaLabel="Lead-Ansicht" value={scope} onChange={setScope} items={scopes.map((s) => ({ value: s.id, label: s.label }))} />
        <PageActions>
          {canSeeOthers && <ButtonLink href="/vertrieb/leads/analyse" text="Auswertung" icon={ChartBarIcon} />}
          <Button text="Lead anlegen" icon={PlusIcon} onClick={() => openModal({
            title: "Lead anlegen", size: "large",
            children: <LeadForm onDone={(id) => {
              closeModal();
              showBanner("Lead angelegt", "Der Lead ist gespeichert und die Erstkontakt-Frist läuft.", "success");
              router.push(`/vertrieb/leads/${id}`);
            }} />,
          })} />
        </PageActions>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="w-full sm:min-w-60 sm:flex-1">
          <SearchBar value={query} onChange={setQuery} debounceMs={300} placeholder="Name, Firma, L-Nummer, Telefon" />
        </div>
        <div className="w-full sm:w-56">
          <Select
            ariaLabel="Phase"
            value={stage}
            onChange={setStage}
            options={[{ value: "", label: "Alle Phasen" }, ...(config?.stages ?? []).map((s) => ({ value: s.code, label: s.name_de }))]}
            fullWidth
          />
        </div>
        <label className="flex shrink-0 cursor-pointer items-center gap-2 text-sm">
          <input type="checkbox" checked={onlyOverdue} onChange={(e) => setOnlyOverdue(e.target.checked)} />
          Nur überfällige
        </label>
      </div>
      {truncated && (
        <Notice tone="info" compact>
          Es werden die neuesten {formatNumber(all.length)} von {formatNumber(data.total)} Leads angezeigt. Bitte nutzen Sie die Suche oder den Phasenfilter.
        </Notice>
      )}
      <DataTable
        rows={rows}
        isLoading={isLoading}
        error={error ? errorText(error) : null}
        getRowId={(l) => l.id}
        onRowClick={(l) => router.push(`/vertrieb/leads/${l.id}`)}
        emptyMessage={query || stage || onlyOverdue ? "Keine Leads passen zu Suche und Filter" : "Keine Leads in dieser Ansicht"}
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
