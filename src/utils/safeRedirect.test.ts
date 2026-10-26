import { describe, expect, it } from "vitest";
import { DEFAULT_REDIRECT, safeInternalPath } from "./safeRedirect";

describe("safeInternalPath", () => {
  it.each([
    ["/einnahmen", "/einnahmen"],
    ["/einnahmen/kategorie/adcuri?jahr=2026#top", "/einnahmen/kategorie/adcuri?jahr=2026#top"],
    ["/", "/"],
  ])("keeps same-site path %s", (input, expected) => {
    expect(safeInternalPath(input)).toBe(expected);
  });

  it.each([
    null,
    undefined,
    "",
    "https://evil.example",
    "javascript:alert(1)",
    "data:text/html,hi",
    "//evil.example",
    "/\\evil.example",
    "\\\\evil.example",
    "/foo\nbar",
    "/foo\u0000",
    "einnahmen",
  ])("falls back for unsafe value %j", (input) => {
    expect(safeInternalPath(input)).toBe(DEFAULT_REDIRECT);
  });

  it("uses a custom fallback", () => {
    expect(safeInternalPath("//evil.example", "/login")).toBe("/login");
  });
});
