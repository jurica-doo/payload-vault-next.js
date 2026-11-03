import { describe, expect, it } from "vitest";
import { managesEmployee } from "./CustomerDetailPage";

const byId = new Map([
  ["dl", { manager_id: null }],
  ["tl", { manager_id: "dl" }],
  ["fa", { manager_id: "tl" }],
  ["other", { manager_id: null }],
]);

describe("managesEmployee", () => {
  it("P5-UX-03 finds direct and indirect managers", () => {
    expect(managesEmployee(byId, "tl", "fa")).toBe(true);
    expect(managesEmployee(byId, "dl", "fa")).toBe(true);
  });
  it("is false for peers, reports and unknown people", () => {
    expect(managesEmployee(byId, "fa", "tl")).toBe(false);
    expect(managesEmployee(byId, "other", "fa")).toBe(false);
    expect(managesEmployee(byId, null, "fa")).toBe(false);
    expect(managesEmployee(undefined, "tl", "fa")).toBe(false);
  });
});
