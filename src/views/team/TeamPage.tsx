"use client";

import { errorText } from "../../utils/dbErrors";
import { LoadingState } from "../../components/loadingState/LoadingState";
import Link from "next/link";
import { useState } from "react";
import { Button } from "../../components/button/Button";
import { HierarchyTree } from "../../components/hierarchyTree/HierarchyTree";
import { StatusBadge, type StatusMap } from "../../components/statusBadge/StatusBadge";
import { EmptyState } from "../../components/emptyState/EmptyState";
import { useStructure } from "../../hooks/useStructure/useStructure";

/** Above this many people the tree starts with the top level only. */
const FULL_EXPAND_LIMIT = 200;

const statusMap: StatusMap<"invited" | "active" | "inactive"> = {
  invited: { label: "Eingeladen", tone: "info" },
  active: { label: "Aktiv", tone: "success" },
  inactive: { label: "Inaktiv", tone: "neutral" },
};

/**
 * "Meine Struktur" (§5.1, §7.1): direct and indirect reports as of today.
 * Production, points and career figures per node arrive with the production
 * and career slices.
 */
export const TeamPage = () => {
  const { data: structure, isLoading, error } = useStructure();
  const [expanded, setExpanded] = useState<Set<string> | null>(null);
  const [selectedId, setSelectedId] = useState<string>();

  if (isLoading) return <LoadingState label="Struktur wird geladen…" />;
  if (error || !structure) {
    return <EmptyState message="Die Struktur konnte nicht geladen werden." hint={error ? errorText(error) : undefined} />;
  }

  // Everyone with reports, i.e. every node that can open.
  const parentIds = [...structure.byId.keys()].filter((id) => structure.childrenOf(id).length > 0);
  // The whole structure starts open so leaders see everyone at once; very
  // large structures start with the top level only, to stay readable.
  const expandedIds =
    expanded ?? new Set(structure.byId.size <= FULL_EXPAND_LIMIT ? parentIds : structure.roots.map((r) => r.id));
  const selected = selectedId ? structure.byId.get(selectedId) : undefined;
  const direct = selected ? structure.childrenOf(selected.employee_id).length : 0;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <section className="ui-card p-4 sm:p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold">Struktur heute</h2>
          {parentIds.length > 0 && (
            <span className="flex gap-1">
              <Button text="Alle aufklappen" variant="ghost" size="small" onClick={() => setExpanded(new Set(parentIds))} />
              <Button text="Alle zuklappen" variant="ghost" size="small" onClick={() => setExpanded(new Set())} />
            </span>
          )}
        </div>
        <HierarchyTree
          roots={structure.roots}
          childrenOf={structure.childrenOf}
          expandedIds={expandedIds}
          onToggle={(id, open) =>
            setExpanded(() => {
              const next = new Set(expandedIds);
              if (open) next.add(id);
              else next.delete(id);
              return next;
            })
          }
          selectedId={selectedId}
          onSelect={(node) => setSelectedId(node.id)}
        />
      </section>

      <aside className="ui-card p-4 sm:p-5" aria-live="polite">
        {selected ? (
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm">
            <dt className="col-span-2 text-base font-semibold text-color-text-main">
              {selected.first_name} {selected.last_name}
            </dt>
            <dt className="text-color-text-subtle">Pers.-Nr.</dt>
            <dd>{selected.employee_no}</dd>
            <dt className="text-color-text-subtle">Status</dt>
            <dd>
              <StatusBadge status={selected.status} map={statusMap} />
            </dd>
            <dt className="text-color-text-subtle">Direkt</dt>
            <dd>{direct}</dd>
            <dt className="text-color-text-subtle">Gesamt</dt>
            <dd>{structure.descendantCount(selected.employee_id)}</dd>
            <dd className="col-span-2 pt-2">
              <Link href={`/vertrieb/team/${selected.employee_id}`} className="font-semibold">Profil & Coaching öffnen</Link>
            </dd>
          </dl>
        ) : (
          <p className="text-sm text-color-text-subtle">Person in der Struktur auswählen, um Details zu sehen.</p>
        )}
      </aside>
    </div>
  );
};
