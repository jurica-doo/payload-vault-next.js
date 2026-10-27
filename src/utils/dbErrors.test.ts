import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  dbErrorMessage,
  errorText,
  GENERIC_ERROR,
  NETWORK_ERROR,
  throwDbError,
  UserFacingError,
} from "./dbErrors";
import { authErrorMessage } from "./authErrors";

const root = join(__dirname, "..", "..");
const read = (...p: string[]) => readFileSync(join(root, ...p), "utf8");

// Raised only inside a function and re-raised as another key; never reach
// the client. Server-to-server keys of cron/webhook functions aren't shown.
const INTERNAL = new Set(["negative", "bad", "method_not_allowed"]);

const migrationKeys = () => {
  const dir = join(root, "supabase", "migrations");
  const keys = new Set<string>();
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql"))) {
    const sql = readFileSync(join(dir, f), "utf8");
    for (const m of sql.matchAll(/raise exception '([a-z_]+)'/gi)) keys.add(m[1]);
    // validate_production returns its error keys as JSON data.
    for (const m of sql.matchAll(/'error',\s*'([a-z_]+)'/g)) keys.add(m[1]);
  }
  return [...keys].filter((k) => !INTERNAL.has(k));
};

const edgeKeys = () => {
  const keys = new Set<string>();
  for (const fn of ["invite-employee", "extract-data-from-expense-image"]) {
    const src = read("supabase", "functions", fn, "index.ts");
    for (const m of src.matchAll(/error: "([a-z_]+)"/g)) keys.add(m[1]);
  }
  keys.add("user_exists");
  keys.add("invite_send_failed");
  return [...keys].filter((k) => !INTERNAL.has(k));
};

describe("dbErrorMessage coverage", () => {
  it("has German text for every key the database raises", () => {
    const missing = migrationKeys().filter((k) => dbErrorMessage({ message: k }) === GENERIC_ERROR);
    expect(missing).toEqual([]);
  });

  it("has German text for every key the user-facing edge functions return", () => {
    const missing = edgeKeys().filter((k) => dbErrorMessage({ message: k }) === GENERIC_ERROR);
    expect(missing).toEqual([]);
  });
});

describe("dbErrorMessage fallbacks", () => {
  it.each([
    ["23P01", "überschneidet"],
    ["23503", "verwendet"],
    ["42501", "Berechtigung"],
    ["22P02", "Format"],
    ["40001", "ausgelastet"],
    ["PGRST301", "Sitzung"],
  ])("maps SQLSTATE %s without leaking the raw text", (code, expected) => {
    const text = dbErrorMessage({ code, message: 'conflicting key value violates exclusion constraint "hierarchy_no_overlap"' });
    expect(text).toContain(expected);
    expect(text).not.toContain("hierarchy_no_overlap");
  });

  it("explains row-level security refusals", () => {
    expect(dbErrorMessage({ message: 'new row violates row-level security policy for table "goals"' })).toContain("Berechtigung");
  });

  it.each(["Failed to fetch", "NetworkError when attempting to fetch resource.", "Load failed"])(
    "recognises the network error %s",
    (message) => expect(dbErrorMessage(new TypeError(message))).toBe(NETWORK_ERROR),
  );

  it("translates storage rejections", () => {
    expect(dbErrorMessage({ statusCode: "413", message: "The object exceeded the maximum allowed size" })).toContain("zu groß");
    expect(dbErrorMessage({ statusCode: "415", message: "mime type text/plain is not supported" })).toContain("Dateiformat");
    expect(dbErrorMessage({ message: "The resource already exists" })).toContain("existiert bereits");
  });

  it("ignores inherited object keys", () => {
    expect(dbErrorMessage({ message: "toString" })).toBe(GENERIC_ERROR);
  });
});

describe("errorText", () => {
  it("passes user-facing errors through and maps everything else", () => {
    expect(errorText(new UserFacingError("Eigene Meldung."))).toBe("Eigene Meldung.");
    expect(errorText(new Error("forbidden"))).toBe(dbErrorMessage({ message: "forbidden" }));
    expect(errorText(new Error("relation public.secret does not exist"))).toBe(GENERIC_ERROR);
  });

  it("keeps an already-mapped message even if re-wrapped", () => {
    const mapped = dbErrorMessage({ message: "mfa_required" });
    expect(errorText(new Error(mapped))).toBe(mapped);
  });

  it("is never empty and accepts a specific fallback", () => {
    expect(errorText(undefined)).toBe(GENERIC_ERROR);
    expect(errorText("weird", "Speziell.")).toBe("Speziell.");
  });

  it("throwDbError throws a UserFacingError", () => {
    expect(() => throwDbError({ message: "not_found" })).toThrow(UserFacingError);
  });
});

describe("authErrorMessage", () => {
  it("does not reveal whether an account exists", () => {
    expect(authErrorMessage({ code: "invalid_credentials" }, "login")).toBe("E-Mail-Adresse oder Passwort ist falsch.");
    expect(authErrorMessage({ message: "Invalid login credentials" }, "login")).toBe("E-Mail-Adresse oder Passwort ist falsch.");
  });

  it.each([
    [{ code: "email_not_confirmed" }, "login", "nicht bestätigt"],
    [{ code: "over_request_rate_limit" }, "login", "Zu viele Versuche"],
    [{ status: 429, message: "Too Many Requests" }, "reset", "Zu viele Versuche"],
    [{ code: "weak_password" }, "update", "zu schwach"],
    [{ code: "same_password" }, "update", "unterscheiden"],
    [{ code: "otp_expired" }, "update", "abgelaufen"],
    [{ code: "mfa_verification_failed" }, "mfa_code", "Code"],
    [{ message: "User already registered" }, "signup", "existiert bereits"],
    [{ name: "AuthRetryableFetchError", message: "Failed to fetch" }, "login", "Verbindung"],
  ] as const)("maps %o in %s", (error, context, expected) => {
    expect(authErrorMessage(error, context)).toContain(expected);
  });

  it("falls back to a context-specific German message, never English", () => {
    expect(authErrorMessage({ message: "Something strange happened" }, "reset")).toContain("Link");
    expect(authErrorMessage(null, "mfa_code")).toContain("Code");
  });
});
