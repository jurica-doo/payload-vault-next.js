import { describe, expect, it } from "vitest";
import { buildStructure, type StructureRow } from "./structure";

const row = (id: string, manager: string | null, last = id.toUpperCase(), status = "active"): StructureRow => ({
  employee_id: id,
  first_name: "X",
  last_name: last,
  employee_no: `P-${id}`,
  status,
  manager_id: manager,
});

describe("buildStructure", () => {
  // DL → TL → FB → FA, DL → TL2
  const rows = [row("dl", null), row("tl", "dl"), row("tl2", "dl", "Ärger"), row("fb", "tl"), row("fa", "fb")];

  it("finds roots and sorts children with German collation", () => {
    const s = buildStructure(rows);
    expect(s.roots.map((n) => n.id)).toEqual(["dl"]);
    expect(s.childrenOf("dl").map((n) => n.id)).toEqual(["tl2", "tl"]); // Ärger before TL
  });

  it("counts all descendants", () => {
    const s = buildStructure(rows);
    expect(s.descendantCount("dl")).toBe(4);
    expect(s.descendantCount("fb")).toBe(1);
    expect(s.descendantCount("fa")).toBe(0);
    expect(s.roots[0].meta).toBe("4 im Team");
  });

  it("makes a leader the root when their own manager is not visible", () => {
    const s = buildStructure([row("tl", "dl"), row("fb", "tl"), row("fa", "fb")]);
    expect(s.roots.map((n) => n.id)).toEqual(["tl"]);
  });

  it("marks inactive people", () => {
    const s = buildStructure([row("dl", null), row("fa", "dl", "Alt", "inactive")]);
    expect(s.childrenOf("dl")[0].label).toMatch(/\(inaktiv\)$/);
  });

  it("does not loop on cyclic data", () => {
    const s = buildStructure([row("a", "b"), row("b", "a")]);
    expect(() => s.descendantCount("a")).not.toThrow();
    expect(s.roots).toEqual([]); // nobody is a root in a pure cycle
  });
});
