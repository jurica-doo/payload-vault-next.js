import { describe, expect, it } from "vitest";
import { compareGoldenIds, extractGoldenIds } from "./goldenParity.mts";

describe("golden parity", () => {
  it("extracts well-formed IDs only", () => {
    const ids = extractGoldenIds("GC-POINTS-001 GC-KV-012 gc-points-002 GC-X-1 GC-AE-003x");
    expect([...ids].sort()).toEqual(["GC-KV-012", "GC-POINTS-001"]);
  });

  it("reports IDs missing on either side", () => {
    const result = compareGoldenIds(
      new Set(["GC-A-001", "GC-A-002"]),
      new Set(["GC-A-002", "GC-A-003"]),
    );
    expect(result).toEqual({ onlyInTs: ["GC-A-001"], onlyInSql: ["GC-A-003"], shared: 1 });
  });

  it("passes when both sides are empty", () => {
    expect(compareGoldenIds(new Set(), new Set())).toEqual({ onlyInTs: [], onlyInSql: [], shared: 0 });
  });
});
