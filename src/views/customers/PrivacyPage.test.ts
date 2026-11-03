import { describe, expect, it } from "vitest";
import { parseRecordNo, subjectLabel } from "./PrivacyPage";

describe("parseRecordNo", () => {
  it("accepts K-/L- numbers with or without padding", () => {
    expect(parseRecordNo("K-00012")).toBe(12);
    expect(parseRecordNo("l-7")).toBe(7);
    expect(parseRecordNo(" 42 ")).toBe(42);
  });
  it("rejects anything else", () => {
    expect(parseRecordNo("X-12")).toBeNull();
    expect(parseRecordNo("")).toBeNull();
    expect(parseRecordNo("12a")).toBeNull();
  });
});

describe("subjectLabel", () => {
  it("P5-UX-02 names the subject with its number", () => {
    expect(subjectLabel({ subject_type: "customer", subject_no: 12 })).toBe("Kunde K-00012");
    expect(subjectLabel({ subject_type: "lead", subject_no: 7 })).toBe("Lead L-00007");
    expect(subjectLabel({ subject_type: "lead", subject_no: null })).toBe("Lead");
  });
});
