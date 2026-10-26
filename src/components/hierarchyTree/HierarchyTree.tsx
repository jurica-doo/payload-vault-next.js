"use client";

import { useState, type KeyboardEvent, type ReactNode } from "react";

export type TreeNode = {
  id: string;
  label: string;
  meta?: ReactNode;
  hasChildren: boolean;
};

type VisibleNode = { node: TreeNode; level: number; parentId: string | null };

/**
 * Flattens the expanded part of the tree in display order. A node that
 * appears again below itself (corrupt data: a reporting-line cycle) is
 * skipped instead of recursing forever.
 */
export function flattenVisible(
  roots: TreeNode[],
  childrenOf: (id: string) => TreeNode[] | undefined,
  expandedIds: ReadonlySet<string>,
): VisibleNode[] {
  const out: VisibleNode[] = [];
  const walk = (nodes: TreeNode[], level: number, parentId: string | null, path: Set<string>) => {
    for (const node of nodes) {
      if (path.has(node.id)) continue;
      out.push({ node, level, parentId });
      if (node.hasChildren && expandedIds.has(node.id)) {
        const kids = childrenOf(node.id);
        if (kids) walk(kids, level + 1, node.id, new Set(path).add(node.id));
      }
    }
  };
  walk(roots, 1, null, new Set());
  return out;
}

/**
 * Sales hierarchy tree (§5.1, §7.1). Data loading stays with the caller:
 * `childrenOf` returns undefined while a branch isn't loaded yet, and
 * `onToggle` is where the caller fetches it. Keyboard support follows the
 * WAI-ARIA tree pattern (arrows, Home/End, Enter to select).
 */
export const HierarchyTree = ({
  roots,
  childrenOf,
  expandedIds,
  onToggle,
  selectedId,
  onSelect,
  label = "Struktur",
}: {
  roots: TreeNode[];
  childrenOf: (id: string) => TreeNode[] | undefined;
  expandedIds: ReadonlySet<string>;
  onToggle: (id: string, expanded: boolean) => void;
  selectedId?: string;
  onSelect?: (node: TreeNode) => void;
  label?: string;
}) => {
  const visible = flattenVisible(roots, childrenOf, expandedIds);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const activeId =
    focusedId && visible.some((v) => v.node.id === focusedId)
      ? focusedId
      : (selectedId ?? visible[0]?.node.id ?? null);

  const focusItem = (id: string | undefined) => {
    if (!id) return;
    setFocusedId(id);
    document.getElementById(`tree-item-${id}`)?.focus();
  };

  const onKeyDown = (e: KeyboardEvent, index: number) => {
    const { node, parentId } = visible[index];
    const expanded = expandedIds.has(node.id);
    switch (e.key) {
      case "ArrowDown":
        focusItem(visible[index + 1]?.node.id);
        break;
      case "ArrowUp":
        focusItem(visible[index - 1]?.node.id);
        break;
      case "ArrowRight":
        if (node.hasChildren && !expanded) onToggle(node.id, true);
        else if (expanded) focusItem(visible[index + 1]?.parentId === node.id ? visible[index + 1].node.id : undefined);
        break;
      case "ArrowLeft":
        if (expanded) onToggle(node.id, false);
        else if (parentId) focusItem(parentId);
        break;
      case "Home":
        focusItem(visible[0]?.node.id);
        break;
      case "End":
        focusItem(visible[visible.length - 1]?.node.id);
        break;
      case "Enter":
      case " ":
        onSelect?.(node);
        break;
      default:
        return;
    }
    e.preventDefault();
  };

  if (visible.length === 0) {
    return <p className="text-sm text-color-text-subtle">Keine Mitarbeitenden in dieser Struktur.</p>;
  }

  return (
    <ul role="tree" aria-label={label} className="flex flex-col text-sm">
      {visible.map(({ node, level }, index) => {
        const expanded = expandedIds.has(node.id);
        const isLoadingChildren = node.hasChildren && expanded && childrenOf(node.id) === undefined;
        return (
          <li
            key={`${node.id}-${level}`}
            id={`tree-item-${node.id}`}
            role="treeitem"
            aria-level={level}
            aria-expanded={node.hasChildren ? expanded : undefined}
            aria-selected={selectedId === node.id}
            aria-busy={isLoadingChildren || undefined}
            tabIndex={activeId === node.id ? 0 : -1}
            onKeyDown={(e) => onKeyDown(e, index)}
            onFocus={() => setFocusedId(node.id)}
            onClick={() => onSelect?.(node)}
            style={{ paddingLeft: `${(level - 1) * 1.25}rem` }}
            className={`flex cursor-pointer items-center gap-2 rounded-radius-sm py-1.5 pr-2 focus:outline-2 focus:outline-color-primary/70 ${
              selectedId === node.id ? "bg-color-bg-accent-subtle" : "hover:bg-color-bg-dark"
            }`}
          >
            {node.hasChildren ? (
              <button
                type="button"
                tabIndex={-1}
                aria-label={expanded ? "Zuklappen" : "Aufklappen"}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggle(node.id, !expanded);
                }}
                className="flex h-5 w-5 cursor-pointer items-center justify-center text-color-text-subtle hover:text-color-primary"
              >
                {expanded ? "▾" : "▸"}
              </button>
            ) : (
              <span aria-hidden className="w-5" />
            )}
            <span className="font-medium text-color-text-main">{node.label}</span>
            {node.meta && <span className="ml-auto text-xs text-color-text-subtle">{node.meta}</span>}
            {isLoadingChildren && <span className="text-xs text-color-text-subtle">lädt…</span>}
          </li>
        );
      })}
    </ul>
  );
};
