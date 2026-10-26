import { describe, expect, it } from "vitest";
import { careerGap, simulateCareer, type ProgressBase } from "./careerSimulator";

// FB candidate from §14.4: 100 P, 7 KV
const fb: ProgressBase = { required: "100", kv_required: "10", cap_value: null, personal: { points: "100", kv: "7" }, structures: [] };

// TL → OL with one big structure (§4.5)
const tl: ProgressBase = {
  required: "750", kv_required: "75", cap_value: "375",
  personal: { points: "100", kv: "0" },
  structures: [
    { id: "A", name: "Fritz", gross: "800", gross_kv: "80" },
    { id: "B", name: "Tara", gross: "100", gross_kv: "10" },
  ],
};

describe("simulateCareer", () => {
  it("reproduces the server result without additions", () => {
    const r = simulateCareer(fb);
    expect([r.eligible.toString(), r.eligibleKv.toString(), r.isReady]).toEqual(["100", "7", false]);
  });

  it("3 more KV points make the FB candidate ready", () => {
    const r = simulateCareer(fb, { personalKv: 3 });
    expect(r.isReady).toBe(true);
    expect(r.eligible.toString()).toBe("103"); // KV points count as points too
  });

  it("adding to a capped structure changes nothing", () => {
    const before = simulateCareer(tl);
    const after = simulateCareer(tl, { structures: { A: { points: 200 } } });
    expect(after.eligible.toString()).toBe(before.eligible.toString());
  });

  it("adding to a structure below the cap counts up to the cap", () => {
    const r = simulateCareer(tl, { structures: { B: { points: 400 } } });
    // B: 100 + 400 = 500 → capped at 375
    expect(r.structures.find((s) => s.id === "B")?.eligible.toString()).toBe("375");
  });

  it("personal additions are never capped", () => {
    const r = simulateCareer(tl, { personalPoints: 1000 });
    expect(r.personal.points.toString()).toBe("1100");
  });
});

describe("careerGap", () => {
  it("shows missing points and KV", () => {
    const g = careerGap(tl);
    // eligible = 100 + 375 + 100 = 575 → 175 missing; KV = 0 + 80×375/800 + 10 = 47.5 → 27.5 missing
    expect(g.pointsMissing.toString()).toBe("175");
    expect(g.kvMissing.toString()).toBe("27.5");
  });

  it("shows where structure points can still count", () => {
    const g = careerGap(tl);
    expect(g.headroom.map((h) => [h.id, h.remaining?.toString()])).toEqual([["A", "0"], ["B", "275"]]);
  });

  it("has no headroom limit below OL (no cap)", () => {
    expect(careerGap({ ...tl, cap_value: null }).headroom[0].remaining).toBeNull();
  });
});
