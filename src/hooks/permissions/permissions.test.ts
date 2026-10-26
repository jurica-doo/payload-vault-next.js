import { describe, expect, it } from "vitest";
import { SALES_MODULES, moduleForPath } from "../../data/salesModules";
import { canSeeModule, derivePermissions, NO_PERMISSIONS, visibleModules } from "./permissions";

const allFlags = Object.fromEntries(SALES_MODULES.map((m) => [m.key, true]));

const ctx = (overrides: Record<string, unknown> = {}) => ({
  user_id: "u1",
  aal: "aal1",
  employee: { id: "e1", first_name: "Fritz", last_name: "B", status: "active", level_code: "FB" },
  roles: [],
  descendant_count: 0,
  feature_flags: allFlags,
  ...overrides,
});

describe("derivePermissions", () => {
  it.each([null, undefined, "x", 42, []])("fails closed for %j", (input) => {
    expect(derivePermissions(input)).toEqual(NO_PERMISSIONS);
  });

  it("treats a vault-only user (no employee row) as non-employee", () => {
    const p = derivePermissions(ctx({ employee: null }));
    expect(p.isEmployee).toBe(false);
    expect(visibleModules(p)).toEqual([]);
  });

  it("exposes the own employee id only while active", () => {
    expect(derivePermissions(ctx()).employeeId).toBe("e1");
    expect(derivePermissions(ctx({ employee: { id: "e1", status: "inactive" } })).employeeId).toBeNull();
  });

  it("treats invited or inactive employees as non-employees", () => {
    for (const status of ["invited", "inactive"]) {
      const p = derivePermissions(ctx({ employee: { id: "e", status } }));
      expect(p.isEmployee).toBe(false);
    }
  });

  it("derives leader only for active employees with descendants", () => {
    expect(derivePermissions(ctx({ descendant_count: 3 })).isLeader).toBe(true);
    expect(derivePermissions(ctx({ descendant_count: 0 })).isLeader).toBe(false);
    expect(derivePermissions(ctx({ descendant_count: "3" })).isLeader).toBe(false);
    expect(derivePermissions(ctx({ descendant_count: 3, employee: null })).isLeader).toBe(false);
  });

  it("reads roles and MFA, ignoring junk", () => {
    const p = derivePermissions(ctx({ roles: ["admin", 7, null, "finance"], aal: "aal2" }));
    expect(p).toMatchObject({ isAdmin: true, isFinance: true, isCompliance: false, hasMfa: true });
  });

  it("only keeps flags that are exactly true", () => {
    const p = derivePermissions(ctx({ feature_flags: { sales: true, leads: "true", tasks: 1, goals: true } }));
    expect(p.flags).toEqual({ sales: true, goals: true });
  });
});

describe("module visibility", () => {
  it("shows nothing while the master flag is off", () => {
    const p = derivePermissions(ctx({ feature_flags: { ...allFlags, sales: false } }));
    expect(visibleModules(p)).toEqual([]);
  });

  it("needs the module's own flag too", () => {
    const p = derivePermissions(ctx({ feature_flags: { sales: true, production: true } }));
    expect(visibleModules(p).map((m) => m.key)).toEqual(["sales", "production"]);
  });

  it("hides the team module from advisers and shows it to leaders", () => {
    const team = SALES_MODULES.find((m) => m.key === "team")!;
    expect(canSeeModule(derivePermissions(ctx()), team)).toBe(false);
    expect(canSeeModule(derivePermissions(ctx({ descendant_count: 1 })), team)).toBe(true);
  });

  it("shows admin only to admins, even without an employee row", () => {
    const admin = SALES_MODULES.find((m) => m.key === "admin")!;
    expect(canSeeModule(derivePermissions(ctx()), admin)).toBe(false);
    expect(canSeeModule(derivePermissions(ctx({ employee: null, roles: ["admin"] })), admin)).toBe(true);
  });

  it("lets finance without an employee row see commissions only", () => {
    const p = derivePermissions(ctx({ employee: null, roles: ["finance"] }));
    expect(visibleModules(p).map((m) => m.key)).toEqual(["commission"]);
  });
});

describe("moduleForPath", () => {
  it.each([
    ["/vertrieb", "sales"],
    ["/vertrieb/produktion", "production"],
    ["/vertrieb/produktion/123", "production"],
    ["/vertrieb/team/provisionen", "team"],
    ["/admin/regeln", "admin"],
  ])("maps %s to %s", (path, key) => {
    expect(moduleForPath(path)?.key).toBe(key);
  });

  it("does not match prefixes of other words", () => {
    expect(moduleForPath("/vertriebsleiter")).toBeUndefined();
    expect(moduleForPath("/einnahmen")).toBeUndefined();
  });
});
