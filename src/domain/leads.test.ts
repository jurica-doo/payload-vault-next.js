import { describe, expect, it } from "vitest";
import { missingFields, slaState, stageChangeNeedsReason, type LeadFacts } from "./leads";

const base: LeadFacts = {
  owner_id: "e1", phone: null, email: null, product_interest: [], next_action_at: null, loss_reason: null,
  consent_basis: null, production_id: null, hasAppointment: false, hasHeldAppointment: false,
};

describe("missingFields", () => {
  it("lists unmet requirements in a stable order", () => {
    expect(missingFields(base, ["product_interest", "owner", "appointment"])).toEqual(["appointment", "product_interest"]);
  });
  it("accepts phone or email", () => {
    expect(missingFields({ ...base, email: "a@b.de" }, ["phone_or_email"])).toEqual([]);
    expect(missingFields(base, ["phone_or_email"])).toEqual(["phone_or_email"]);
  });
  it("ignores unknown field names (the database rejects them on save)", () => {
    expect(missingFields(base, ["something_else"])).toEqual([]);
  });
});

describe("slaState", () => {
  const due = "2026-11-03T09:00:00Z";
  it("open, overdue, met and met late", () => {
    expect(slaState({ first_contact_at: null, sla_due_at: due }, "2026-11-03T08:00:00Z")).toBe("open");
    expect(slaState({ first_contact_at: null, sla_due_at: due }, "2026-11-03T10:00:00Z")).toBe("overdue");
    expect(slaState({ first_contact_at: "2026-11-02T12:00:00Z", sla_due_at: due })).toBe("met");
    expect(slaState({ first_contact_at: "2026-11-04T12:00:00Z", sla_due_at: due })).toBe("late_met");
  });
  it("closed leads without contact are not overdue", () => {
    expect(slaState({ first_contact_at: null, sla_due_at: due, closed_at: "2026-11-05T00:00:00Z" }, "2026-11-06T00:00:00Z")).toBe("none");
  });
});

describe("stageChangeNeedsReason", () => {
  const open = (position: number) => ({ kind: "open", position });
  it("forward is free, backward and reopening need a reason", () => {
    expect(stageChangeNeedsReason(open(30), open(50))).toBe(false);
    expect(stageChangeNeedsReason(open(50), open(30))).toBe(true);
    expect(stageChangeNeedsReason({ kind: "lost", position: 91 }, open(40))).toBe(true);
    expect(stageChangeNeedsReason(open(40), { kind: "lost", position: 91 })).toBe(false);
  });
});
