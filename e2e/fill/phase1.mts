// Phase 1 fill: creates the Phase 1 cast through the real API (admin with
// TOTP, invite → account → confirmation, roles, levels, reporting lines),
// enters production as each producer, confirms it as finance, then checks
// that the stored points and career numbers match the fixtures.
import {
  CAST,
  EXPECTED_CAREER,
  PLANNED_TRANSFER,
  PRODUCTION,
  SEED,
  START_DATE,
  type ProductionFixture,
} from "../fixtures/phase1.mts";
import { adminConfirmEmail, adminCreateUser, enrollTotp, rpc, signIn, type Session } from "../lib/api.mts";
import { sql, sqlJson } from "../lib/db.mts";
import { writeState, type E2EState } from "../lib/state.mts";

const REASON = "E2E-Testdaten (Phase 1)";
const log = (msg: string) => console.log(`  ${msg}`);

function fail(msg: string): never {
  throw new Error(`Phase 1 fill check failed: ${msg}`);
}

export async function fillPhase1(state: E2EState): Promise<void> {
  console.log("Phase 1 — identity, hierarchy, rules, production, career");

  if (sql("select count(*) from public.employees where email = 'dl@test.com'") !== "0") {
    fail("Phase 1 data already exists. Run `npm run e2e:prepare` (it resets the local DB first).");
  }

  // ---- admin with TOTP (admin writes require aal2) ----
  const adminTotp = await enrollTotp(await signIn(SEED.admin)).catch((e: Error) =>
    fail(`could not enrol TOTP for ${SEED.admin} (${e.message}). Reset with \`npm run e2e:prepare\`.`),
  );
  const admin = adminTotp.session;
  state.totp[SEED.admin] = { secret: adminTotp.secret, factorId: adminTotp.factorId };
  state.users[SEED.admin] = admin.userId;
  for (const email of [SEED.admin, SEED.user]) {
    state.employees[email] = sql(`select id from public.employees where email = '${email}'`);
  }
  writeState(state);
  log(`${SEED.admin}: TOTP enrolled, session aal2`);

  // ---- employees, invites, accounts ----
  for (const m of CAST) {
    const created = await rpc<{ employee_id: string; needs_invite: boolean }>(admin, "rpc_create_employee", {
      p_first_name: m.first,
      p_last_name: m.last,
      p_email: m.email,
      p_start_date: START_DATE,
      p_employee_no: m.employeeNo,
    });
    state.employees[m.email] = created.employee_id;
    if (!created.needs_invite) fail(`${m.email} should need an invite`);
    if (m.login) {
      // Stands in for opening the invite mail and setting a password.
      const userId = await adminCreateUser(m.email);
      await adminConfirmEmail(userId);
      state.users[m.email] = userId;
    }
  }
  const logins = CAST.filter((m) => m.login).map((m) => `'${m.email}'`).join(",");
  sql(`update auth.users set encrypted_password = extensions.crypt('123456', extensions.gen_salt('bf')) where email in (${logins})`);
  const statuses = sqlJson<{ email: string; status: string }>(
    `select email, status from public.employees where email in (${CAST.map((m) => `'${m.email}'`).join(",")})`,
  );
  for (const m of CAST) {
    const want = m.login ? "active" : "invited";
    const got = statuses.find((s) => s.email === m.email)?.status;
    if (got !== want) fail(`${m.email} status ${got}, expected ${want}`);
  }
  writeState(state);
  log(`${CAST.length} employees created (${CAST.filter((m) => m.login).length} with login, 1 invited only)`);

  // ---- roles, levels, reporting lines ----
  for (const m of CAST) {
    for (const role of m.roles ?? []) {
      await rpc(admin, "rpc_grant_role", { p_user_id: state.users[m.email], p_role: role, p_reason: REASON });
    }
    if (m.level) {
      await rpc(admin, "rpc_set_employee_level", {
        p_employee_id: state.employees[m.email],
        p_level_code: m.level,
        p_effective_from: START_DATE,
        p_reason: REASON,
      });
    }
  }
  for (const m of CAST) {
    // Dora is the explicit top of her structure; finance, compliance and the
    // invited person get no reporting line (they belong to no structure).
    if (m.manager === null && m.email !== "dl@test.com") continue;
    await rpc(admin, "rpc_assign_manager", {
      p_employee_id: state.employees[m.email],
      p_manager_id: m.manager ? state.employees[m.manager] : null,
      p_effective_from: START_DATE,
      p_reason: REASON,
    });
  }
  await rpc(admin, "rpc_assign_manager", {
    p_employee_id: state.employees[PLANNED_TRANSFER.employee],
    p_manager_id: state.employees[PLANNED_TRANSFER.newManager],
    p_effective_from: PLANNED_TRANSFER.from,
    p_reason: "E2E: geplanter Wechsel von Anna zu Ben",
  });
  for (const m of CAST.filter((c) => c.inactive)) {
    await rpc(admin, "rpc_set_employee_active", { p_employee_id: state.employees[m.email], p_active: false, p_reason: REASON });
  }
  log("roles, levels, reporting lines, planned transfer and deactivation done");

  // ---- finance with TOTP (marking production eligible requires aal2) ----
  const financeEmail = CAST.find((m) => m.roles?.includes("finance"))!.email;
  const financeTotp = await enrollTotp(await signIn(financeEmail));
  state.totp[financeEmail] = { secret: financeTotp.secret, factorId: financeTotp.factorId };
  const finance = financeTotp.session;
  writeState(state);
  log(`${financeEmail}: TOTP enrolled, session aal2`);

  // ---- production: producer enters, finance confirms/cancels/corrects ----
  const producers = new Map<string, Session>();
  for (const p of PRODUCTION) {
    if (!producers.has(p.producer)) producers.set(p.producer, await signIn(p.producer));
    state.production[p.key] = await enterProduction(producers.get(p.producer)!, finance, p, state);
  }
  writeState(state);
  log(`${PRODUCTION.length} production records entered`);

  checkProduction(state);
  await checkCareer();
  log("self-check passed: points and career numbers match the fixtures");
}

async function enterProduction(producer: Session, finance: Session, p: ProductionFixture, state: E2EState): Promise<string> {
  const id = await rpc<string>(producer, "rpc_save_production", {
    p_id: null,
    p_producer_id: state.employees[p.producer],
    p_category_code: p.category,
    p_premium_amount: p.premium,
    p_premium_period: p.period,
    p_net_or_gross: p.netOrGross ?? null,
    p_term_years: p.termYears ?? null,
    p_production_date: state.businessDate,
    p_product_reference: p.reference,
  });
  if (p.status === "draft") return id;
  await rpc(producer, "rpc_submit_production", { p_id: id });
  if (p.status === "submitted") return id;
  await rpc(finance, "rpc_mark_production_eligible", { p_id: id });
  if (p.status === "cancelled") {
    await rpc(finance, "rpc_cancel_production", { p_id: id, p_reason: "E2E: Vertrag storniert (Test)" });
  }
  if (p.status === "corrected") {
    await rpc(finance, "rpc_correct_production", {
      p_id: id,
      p_premium_amount: p.correctTo,
      p_premium_period: p.period,
      p_net_or_gross: p.netOrGross ?? null,
      p_term_years: p.termYears ?? null,
      p_production_date: state.businessDate,
      p_reason: "E2E: Beitrag laut Police korrigiert",
    });
  }
  return id;
}

function checkProduction(state: E2EState): void {
  const rows = sqlJson<{ id: string; status: string; points: string | null; ae: string | null; kv_points: string | null }>(
    `select id, status, round(points, 4)::text as points, round(ae, 4)::text as ae, round(kv_points, 4)::text as kv_points from public.v_production`,
  );
  for (const p of PRODUCTION) {
    const row = rows.find((r) => r.id === state.production[p.key]);
    if (!row) fail(`${p.key} not found`);
    const wantStatus = p.status === "corrected" ? "eligible" : p.status;
    if (row.status !== wantStatus) fail(`${p.key} status ${row.status}, expected ${wantStatus}`);
    if (p.expected) {
      const got = { points: row.points ?? "0.0000", ae: row.ae ?? "0.0000", kv: row.kv_points ?? "0.0000" };
      if (got.points !== p.expected.points || got.ae !== p.expected.ae || got.kv !== p.expected.kv) {
        fail(`${p.key} totals ${JSON.stringify(got)}, expected ${JSON.stringify(p.expected)}`);
      }
    }
  }
}

// Shape of app_private.compute_qualification (status ready/in_progress,
// totals from apply_career_rules).
type Progress = {
  status?: string;
  target?: string | { code?: string };
  is_ready?: boolean;
  eligible?: number | string;
  eligible_kv?: number | string;
  [key: string]: unknown;
};

async function checkCareer(): Promise<void> {
  for (const [email, want] of Object.entries(EXPECTED_CAREER)) {
    const me = await signIn(email);
    const progress = await rpc<Progress>(me, "rpc_career_progress");
    const target = typeof progress.target === "object" ? progress.target?.code : progress.target;
    const got = {
      target: String(target),
      points: Number(progress.eligible).toFixed(4),
      kv: Number(progress.eligible_kv).toFixed(4),
      ready: progress.is_ready === true && progress.status === "ready",
    };
    if (got.target !== want.target || got.points !== want.points || got.kv !== want.kv || got.ready !== want.ready) {
      fail(`career of ${email}: ${JSON.stringify(got)}, expected ${JSON.stringify(want)} — raw: ${JSON.stringify(progress)}`);
    }
  }
}
