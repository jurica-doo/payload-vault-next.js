import {
  SALES_MODULES,
  type Audience,
  type FeatureFlagKey,
  type SalesModule,
} from "../../data/salesModules";

/** Shape returned by public.rpc_my_context() (see its migration). */
export type MyContext = {
  user_id: string;
  aal: "aal1" | "aal2" | string;
  employee: {
    id: string;
    first_name: string;
    last_name: string;
    status: "invited" | "active" | "inactive" | string;
    level_code: string | null;
  } | null;
  roles: string[];
  descendant_count: number;
  feature_flags: Partial<Record<FeatureFlagKey, boolean>>;
};

export type Permissions = {
  /** Own employee id while active; null for vault-only, invited or inactive users. */
  employeeId: string | null;
  isEmployee: boolean;
  isLeader: boolean;
  isAdmin: boolean;
  isFinance: boolean;
  isCompliance: boolean;
  /** Admin and finance actions need MFA (plan §4.3); the DB enforces it too. */
  hasMfa: boolean;
  flags: Partial<Record<FeatureFlagKey, boolean>>;
};

export const NO_PERMISSIONS: Permissions = {
  employeeId: null,
  isEmployee: false,
  isLeader: false,
  isAdmin: false,
  isFinance: false,
  isCompliance: false,
  hasMfa: false,
  flags: {},
};

/**
 * Turns the RPC payload into booleans. Defensive on purpose: the payload is
 * JSON from the network, and a missing or malformed field must mean "no
 * access", never "access".
 */
export function derivePermissions(ctx: unknown): Permissions {
  if (!ctx || typeof ctx !== "object") return NO_PERMISSIONS;
  const c = ctx as Partial<MyContext>;
  const roles = Array.isArray(c.roles) ? c.roles.filter((r) => typeof r === "string") : [];
  const flags =
    c.feature_flags && typeof c.feature_flags === "object" && !Array.isArray(c.feature_flags)
      ? Object.fromEntries(
          Object.entries(c.feature_flags).filter(([, v]) => v === true),
        )
      : {};
  const isEmployee = !!c.employee && c.employee.status === "active";

  return {
    employeeId: isEmployee && typeof c.employee?.id === "string" ? c.employee.id : null,
    isEmployee,
    isLeader: isEmployee && typeof c.descendant_count === "number" && c.descendant_count > 0,
    isAdmin: roles.includes("admin"),
    isFinance: roles.includes("finance"),
    isCompliance: roles.includes("compliance"),
    hasMfa: c.aal === "aal2",
    flags,
  };
}

const meetsAudience = (perms: Permissions, audience: Audience): boolean => {
  switch (audience) {
    case "employee":
      return perms.isEmployee;
    case "leader":
      return perms.isLeader;
    case "admin":
      return perms.isAdmin;
    case "finance":
      return perms.isFinance;
    case "compliance":
      return perms.isCompliance;
  }
};

export function canSeeModule(perms: Permissions, module: SalesModule): boolean {
  if (perms.flags.sales !== true || perms.flags[module.key] !== true) return false;
  return module.audience.some((a) => meetsAudience(perms, a));
}

export function visibleModules(perms: Permissions): SalesModule[] {
  return SALES_MODULES.filter((m) => canSeeModule(perms, m));
}
