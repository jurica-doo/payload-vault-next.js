import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { flattenVisible, HierarchyTree, type TreeNode } from "./HierarchyTree";

// DL → TL → FB → FA (§5.3)
const nodes: Record<string, TreeNode> = {
  dl: { id: "dl", label: "DL Dora", hasChildren: true },
  tl: { id: "tl", label: "TL Tim", hasChildren: true },
  fb: { id: "fb", label: "FB Fritz", hasChildren: true },
  fa: { id: "fa", label: "FA Anna", hasChildren: false },
};
const children: Record<string, TreeNode[]> = { dl: [nodes.tl], tl: [nodes.fb], fb: [nodes.fa] };

describe("flattenVisible", () => {
  it("only includes expanded branches", () => {
    const out = flattenVisible([nodes.dl], (id) => children[id], new Set(["dl"]));
    expect(out.map((v) => [v.node.id, v.level])).toEqual([["dl", 1], ["tl", 2]]);
  });

  it("survives a reporting-line cycle in the data", () => {
    const cyclic: Record<string, TreeNode[]> = { dl: [nodes.tl], tl: [nodes.dl] };
    const out = flattenVisible([nodes.dl], (id) => cyclic[id], new Set(["dl", "tl"]));
    expect(out.map((v) => v.node.id)).toEqual(["dl", "tl"]);
  });
});

describe("HierarchyTree", () => {
  it("exposes tree semantics and levels", () => {
    render(
      <HierarchyTree roots={[nodes.dl]} childrenOf={(id) => children[id]} expandedIds={new Set(["dl", "tl"])} onToggle={() => {}} />,
    );
    const items = screen.getAllByRole("treeitem");
    expect(items.map((i) => i.getAttribute("aria-level"))).toEqual(["1", "2", "3"]);
    expect(items[0]).toHaveAttribute("aria-expanded", "true");
    expect(items[2]).toHaveAttribute("aria-expanded", "false");
  });

  it("expands with ArrowRight and collapses with ArrowLeft", () => {
    const onToggle = vi.fn();
    const { rerender } = render(
      <HierarchyTree roots={[nodes.dl]} childrenOf={(id) => children[id]} expandedIds={new Set()} onToggle={onToggle} />,
    );
    fireEvent.keyDown(screen.getByRole("treeitem"), { key: "ArrowRight" });
    expect(onToggle).toHaveBeenCalledWith("dl", true);
    rerender(
      <HierarchyTree roots={[nodes.dl]} childrenOf={(id) => children[id]} expandedIds={new Set(["dl"])} onToggle={onToggle} />,
    );
    fireEvent.keyDown(screen.getAllByRole("treeitem")[0], { key: "ArrowLeft" });
    expect(onToggle).toHaveBeenCalledWith("dl", false);
  });

  it("shows a loading hint while children are not loaded", () => {
    render(<HierarchyTree roots={[nodes.dl]} childrenOf={() => undefined} expandedIds={new Set(["dl"])} onToggle={() => {}} />);
    expect(screen.getByText("lädt…")).toBeInTheDocument();
  });

  it("selects with Enter", () => {
    const onSelect = vi.fn();
    render(<HierarchyTree roots={[nodes.fa]} childrenOf={() => undefined} expandedIds={new Set()} onToggle={() => {}} onSelect={onSelect} />);
    fireEvent.keyDown(screen.getByRole("treeitem"), { key: "Enter" });
    expect(onSelect).toHaveBeenCalledWith(nodes.fa);
  });

  it("renders an empty message", () => {
    render(<HierarchyTree roots={[]} childrenOf={() => undefined} expandedIds={new Set()} onToggle={() => {}} />);
    expect(screen.getByText("Keine Mitarbeitenden in dieser Struktur.")).toBeInTheDocument();
  });
});
