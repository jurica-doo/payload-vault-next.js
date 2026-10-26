"use client";

import { useState } from "react";
import { HierarchyTree } from "../../components/hierarchyTree/HierarchyTree";
import { StatusBadge, type StatusMap } from "../../components/statusBadge/StatusBadge";
import { EmptyState } from "../../components/emptyState/EmptyState";
import { useStructure } from "../../hooks/useStructure/useStructure";

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

  if (isLoading) return <p className="text-sm text-color-text-subtle">Struktur wird geladen…</p>;
  if (error || !structure) {
    return <EmptyState message="Die Struktur konnte nicht geladen werden." hint={error?.message} />;
  }

  // Roots start expanded so a leader sees their direct reports at once.
  const expandedIds = expanded ?? new Set(structure.roots.map((r) => r.id));
  const selected = selectedId ? structure.byId.get(selectedId) : undefined;
  const direct = selected ? structure.childrenOf(selected.employee_id).length : 0;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <section className="rounded-radius-lg bg-color-bg-card p-4 shadow-shadow-soft">
        <h2 className="mb-3 text-base font-semibold">Struktur heute</h2>
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

      <aside className="rounded-radius-lg bg-color-bg-card p-4 shadow-shadow-soft" aria-live="polite">
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
          </dl>
        ) : (
          <p className="text-sm text-color-text-subtle">Person in der Struktur auswählen, um Details zu sehen.</p>
        )}
      </aside>
    </div>
  );
};
