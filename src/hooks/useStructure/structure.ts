import type { TreeNode } from "../../components/hierarchyTree/HierarchyTree";

export type StructureRow = {
  employee_id: string;
  first_name: string;
  last_name: string;
  employee_no: string;
  status: string;
  manager_id: string | null;
};

export type Structure = {
  roots: TreeNode[];
  childrenOf: (id: string) => TreeNode[];
  byId: Map<string, StructureRow>;
  /** All descendants (any depth) per employee. */
  descendantCount: (id: string) => number;
};

const label = (r: StructureRow) => `${r.last_name}, ${r.first_name}`;

/**
 * Builds the tree from the rows the caller may see (RLS already filtered
 * them). A root is anyone whose manager isn't visible: for a team leader
 * that's themselves (their own manager is hidden), for an admin it's the top
 * of each structure. Rows with a manager pointing into a cycle are still
 * shown once, because HierarchyTree skips repeats.
 */
export function buildStructure(rows: StructureRow[]): Structure {
  const byId = new Map(rows.map((r) => [r.employee_id, r]));
  const children = new Map<string, StructureRow[]>();
  for (const r of rows) {
    if (r.manager_id && byId.has(r.manager_id)) {
      children.set(r.manager_id, [...(children.get(r.manager_id) ?? []), r]);
    }
  }
  const sortRows = (list: StructureRow[]) =>
    [...list].sort((a, b) => label(a).localeCompare(label(b), "de-DE"));

  const countCache = new Map<string, number>();
  const descendantCount = (id: string, seen = new Set<string>()): number => {
    if (countCache.has(id)) return countCache.get(id)!;
    if (seen.has(id)) return 0;
    seen.add(id);
    const kids = children.get(id) ?? [];
    const total = kids.reduce((sum, k) => sum + 1 + descendantCount(k.employee_id, seen), 0);
    countCache.set(id, total);
    return total;
  };

  const toNode = (r: StructureRow): TreeNode => {
    const total = descendantCount(r.employee_id);
    return {
      id: r.employee_id,
      label: `${label(r)}${r.status === "inactive" ? " (inaktiv)" : ""}`,
      hasChildren: (children.get(r.employee_id)?.length ?? 0) > 0,
      meta: total > 0 ? `${total} im Team` : undefined,
    };
  };

  const roots = sortRows(rows.filter((r) => !r.manager_id || !byId.has(r.manager_id))).map(toNode);

  return {
    roots,
    childrenOf: (id) => sortRows(children.get(id) ?? []).map(toNode),
    byId,
    descendantCount: (id) => descendantCount(id),
  };
}
