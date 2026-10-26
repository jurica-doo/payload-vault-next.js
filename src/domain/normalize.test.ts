import { describe, expect, it } from "vitest";
import { normalizeEmail, normalizePhone } from "./normalize";

describe("normalizePhone", () => {
  it.each([
    ["0170 123 4567", "+491701234567"],
    ["+49 (0) 170-1234567", "+491701234567"],
    ["0049 170 1234567", "+491701234567"],
    ["+49 170/123.45.67", "+491701234567"],
    ["+43 664 1234567", "+436641234567"],
    ["  030 12345678 ", "+493012345678"],
  ])("normalises %j to %j", (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it.each(["", "   ", "abc", "170 1234567", "+49 170 12x4567", "+0 170", "+4917012345678901234", "0049+170", "12"])(
    "rejects %j",
    (input) => {
      expect(normalizePhone(input)).toBeNull();
    },
  );
});

describe("normalizeEmail", () => {
  it("trims and lowercases", () => {
    expect(normalizeEmail("  Nora.Neu@Pro-Fina.DE ")).toBe("nora.neu@pro-fina.de");
  });

  it.each(["", "nora", "nora@", "@pro-fina.de", "a b@c.de", "a@b"])("rejects %j", (input) => {
    expect(normalizeEmail(input)).toBeNull();
  });
});
