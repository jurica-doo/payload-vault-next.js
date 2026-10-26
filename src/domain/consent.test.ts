import { describe, expect, it } from "vitest";
import { currentState, mayContact, type ConsentEvent } from "./consent";

const ev = (id: number, purpose: string, action: string, at: string, basis: string | null = null): ConsentEvent =>
  ({ id, purpose, action, legal_basis: basis, source: "form", evidence: null, effective_at: at });
const customer = { email: "a@b.de", phone: "+491701234567", date_of_birth: null, archived_at: null, status: "active" };
const now = "2026-10-28T12:00:00Z";

describe("consent state (mirrors app_private.may_contact)", () => {
  it("latest by effective time wins, not entry order", () => {
    const s = currentState([
      ev(1, "marketing_email", "granted", "2026-10-01T00:00:00Z", "consent"),
      ev(2, "marketing_email", "withdrawn", "2026-10-10T00:00:00Z"),
      ev(3, "marketing_email", "granted", "2026-09-01T00:00:00Z", "consent"), // back-dated, entered later
    ], now);
    expect(s.get("marketing_email")?.id).toBe(2);
    expect(mayContact(customer, s, "marketing_email")).toEqual({ allowed: false, reason: "withdrawn" });
  });

  it("opt-out overrides every basis; opt-in restores", () => {
    const base = [ev(1, "contact_phone", "granted", "2026-10-01T00:00:00Z", "contract"), ev(2, "all", "opt_out", "2026-10-02T00:00:00Z")];
    expect(mayContact(customer, currentState(base, now), "contact_phone").reason).toBe("opt_out");
    const lifted = [...base, ev(3, "all", "opt_in", "2026-10-03T00:00:00Z")];
    expect(mayContact(customer, currentState(lifted, now), "contact_phone").allowed).toBe(true);
  });

  it("checks addresses, birth date and archive before the basis", () => {
    const s = currentState([ev(1, "birthday_email", "granted", "2026-10-01T00:00:00Z", "consent")], now);
    expect(mayContact(customer, s, "birthday_email").reason).toBe("no_birth_date");
    expect(mayContact({ ...customer, email: null }, s, "birthday_email").reason).toBe("no_address");
    expect(mayContact({ ...customer, archived_at: "2026-10-05T00:00:00Z" }, s, "birthday_email").reason).toBe("customer_inactive");
    expect(mayContact(customer, s, "holiday_email").reason).toBe("no_legal_basis");
  });

  it("ignores events dated in the future", () => {
    const s = currentState([ev(1, "contact_email", "granted", "2026-11-01T00:00:00Z", "consent")], now);
    expect(s.has("contact_email")).toBe(false);
  });
});
