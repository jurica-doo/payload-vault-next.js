import { describe, expect, it } from "vitest";
import { parseRecordNo } from "./PrivacyPage";

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
