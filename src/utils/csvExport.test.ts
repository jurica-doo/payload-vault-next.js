import { describe, expect, it } from "vitest";
import { escapeCsvValue } from "./csvExport";

describe("escapeCsvValue", () => {
  it("returns empty string for null and undefined", () => {
    expect(escapeCsvValue(null)).toBe("");
    expect(escapeCsvValue(undefined)).toBe("");
  });

  it("leaves plain text and numbers untouched", () => {
    expect(escapeCsvValue("Büro Müller")).toBe("Büro Müller");
    expect(escapeCsvValue(42.5)).toBe("42.5");
  });

  it.each(["=SUM(A1:A2)", "+1", "-1", "@cmd", "\t=1"])(
    "guards formula-like value %j",
    (input) => {
      expect(escapeCsvValue(input).startsWith("'")).toBe(true);
    },
  );

  it("quotes separators, quotes and newlines", () => {
    expect(escapeCsvValue("a;b")).toBe('"a;b"');
    expect(escapeCsvValue('say "hi"')).toBe('"say ""hi"""');
    expect(escapeCsvValue("line1\nline2")).toBe('"line1\nline2"');
  });

  it("strips control characters", () => {
    expect(escapeCsvValue("a\u0000b\u0007c")).toBe("abc");
  });
});
