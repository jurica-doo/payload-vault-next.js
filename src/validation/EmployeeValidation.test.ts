import { describe, expect, it } from "vitest";
import { employeeSchema } from "./EmployeeValidation";
import { dbErrorMessage, GENERIC_ERROR } from "../utils/dbErrors";

const valid = {
  firstName: " Nora ",
  lastName: "Neumann",
  email: " Nora.Neumann@Pro-Fina.de ",
  startDate: "2026-11-01",
  employmentType: "full_time" as const,
  phone: "0170 1234567",
};

describe("employeeSchema", () => {
  it("normalises name, email and phone", () => {
    const parsed = employeeSchema.parse(valid);
    expect(parsed).toMatchObject({
      firstName: "Nora",
      email: "nora.neumann@pro-fina.de",
      phone: "+491701234567",
    });
  });

  it("treats an empty phone as none", () => {
    expect(employeeSchema.parse({ ...valid, phone: "  " }).phone).toBeNull();
  });

  it.each([
    ["firstName", { firstName: "   " }],
    ["email", { email: "nora@" }],
    ["phone", { phone: "abc" }],
    ["startDate", { startDate: "" }],
    ["startDate", { startDate: "1999-12-31" }],
  ])("reports %s", (field, patch) => {
    const result = employeeSchema.safeParse({ ...valid, ...patch });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path[0]).toBe(field);
  });
});

describe("dbErrorMessage", () => {
  it("maps machine keys", () => {
    expect(dbErrorMessage({ message: "mfa_required", code: "42501" })).toMatch(/Zwei-Faktor/);
    expect(dbErrorMessage({ message: "last_admin" })).toMatch(/letzte Administrator/);
  });

  it("falls back on the SQLSTATE for constraint errors without leaking the raw text", () => {
    const msg = dbErrorMessage({ message: 'new row violates check constraint "employees_phone_check"', code: "23514" });
    expect(msg).not.toMatch(/employees_phone_check/);
    expect(msg).toMatch(/Eingaben/);
  });

  it("is generic for anything unknown", () => {
    expect(dbErrorMessage(new Error("relation public.x does not exist"))).toBe(GENERIC_ERROR);
    expect(dbErrorMessage(null)).toBe(GENERIC_ERROR);
  });
});
