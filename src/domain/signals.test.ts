import { describe, expect, it } from "vitest";
import { signalText } from "./signals";

describe("signalText", () => {
  it("shows both rates with their denominators", () => {
    const t = signalText({ code: "contact_rate_down", severity: "warning", now: { num: 4, den: 12 }, before: { num: 12, den: 12 } });
    expect(t).toContain("(4 von 12)");
    expect(t).toContain("(12 von 12)");
    expect(t.endsWith("?")).toBe(true);
  });
  it("person prompts name the person and the count, as a question", () => {
    const t = signalText({ code: "overdue_tasks", severity: "warning", name: "Fritz FA", count: 6 });
    expect(t).toMatch(/^Fritz FA: 6 Aufgaben.*\?$/);
  });
});
