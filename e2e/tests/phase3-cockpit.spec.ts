// Phase 3 · management cockpit (requirements1/phase-3-cockpit; spec §7.2–7.5, §8, §14.5) and the
// review findings (phase-3-cockpit/verification/r1-p3-verification.md; titles start with the ID).
// Story: Fritz (FA, Tina's team) plans a month, Tina returns it, Dora approves it; Tina documents a
// coaching conversation with a private note; the dashboard shows goal, forecast and agreed actions.
// Data this file changes: goals of Fritz and Paula, coaching data of Fritz. No other file asserts on those.
import { expect, test, type Browser, type Page } from "@playwright/test";
import { ApiError, rpc, select } from "../lib/api.mts";
import { sql } from "../lib/db.mts";
import { readState } from "../lib/state.mts";
import { loginAs } from "./helpers";
import { apiSession } from "./sessions";

const emp = (email: string) => readState().employees[email];
const month = (offset: number) => {
  const [y, m] = readState().businessDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + offset, 1)).toISOString().slice(0, 10);
};

async function refused(promise: Promise<unknown>, key: string) {
  const error = await promise.then(() => null, (e: unknown) => e);
  expect(error, `expected "${key}"`).toBeInstanceOf(ApiError);
  expect((error as ApiError).message).toContain(key);
}

/** A fresh page signed in as `email` (sessions are seeded per page, so switching accounts needs a new one). */
async function open(browser: Browser, email: string, path: string, opts: { aal2?: boolean } = {}): Promise<Page> {
  const page = await browser.newPage();
  await loginAs(page, email, opts);
  await page.goto(path);
  return page;
}

async function openGoals(browser: Browser, email: string): Promise<Page> {
  const page = await open(browser, email, "/vertrieb/ziele");
  await expect(page.getByRole("heading", { name: /Meine Ziele/ })).toBeVisible();
  return page;
}

test.describe.configure({ mode: "serial" });

test.describe("Monatsziele (§7.2, §14.5)", () => {
  test("Fritz reicht 20 P / 2 KV ein; das Formular ist bis zur Entscheidung gesperrt", async ({ browser }) => {
    const page = await openGoals(browser, "fa@test.com");
    await page.getByLabel("Punkte", { exact: true }).fill("20");
    await page.getByLabel("davon KV-Punkte").fill("2");
    await page.getByLabel("Kommentar zur Einreichung (optional)").fill("Fokus auf KV");
    await page.getByRole("button", { name: "Einreichen" }).click();
    await expect(page.getByText("Eingereicht", { exact: true })).toBeVisible();
    await expect(page.getByText("Wartet auf Freigabe")).toBeVisible();
    await expect(page.getByLabel("Punkte", { exact: true })).toHaveAttribute("readonly", "");
    await expect(page.getByRole("button", { name: "Einreichen" })).toHaveCount(0);
  });

  test("Tina gibt mit Rückmeldung zurück; Fritz sieht sie, passt an und reicht erneut ein", async ({ browser }) => {
    const versions = () => Number(sql(`select count(*) from public.monthly_goal_versions v join public.monthly_goals g on g.id = v.goal_id
                 where g.employee_id = '${emp("fa@test.com")}' and g.month = '${month(0)}'`));
    const before = versions();
    const tina = await openGoals(browser, "tl2@test.com");
    await expect(tina.getByText("Zur Freigabe (1)")).toBeVisible();
    const item = tina.getByRole("listitem").filter({ hasText: "Fritz Fleißig" });
    await expect(item).toContainText("Punkte: 20");
    await item.getByRole("button", { name: "Zurückgeben" }).click();
    const dialog = tina.getByRole("dialog", { name: "Ziel zurückgeben" });
    await dialog.getByLabel("Rückmeldung").fill("KV-Ziel bitte auf 3 erhöhen");
    await dialog.getByRole("button", { name: "Zurückgeben" }).click();
    await expect(tina.getByText("Zurückgegeben", { exact: true }).first()).toBeVisible();
    await expect(tina.getByText("Zur Freigabe (1)")).toHaveCount(0);

    const page = await openGoals(browser, "fa@test.com");
    await expect(page.getByRole("note")).toContainText("KV-Ziel bitte auf 3 erhöhen");
    await expect(page.getByLabel("davon KV-Punkte")).toHaveValue("2");
    await page.getByLabel("davon KV-Punkte").fill("3");
    await page.getByRole("button", { name: "Einreichen" }).click();
    await expect(page.getByText("Wartet auf Freigabe")).toBeVisible();
    expect(versions()).toBe(before + 1); // every submission is an immutable version (§7.2)
    expect(sql(`select decision || ':' || comment from public.goal_reviews order by created_at desc limit 1`)).toBe("returned:KV-Ziel bitte auf 3 erhöhen");
  });

  test("Dora (indirekte Führungskraft) gibt frei; Fritz' Dashboard misst am Ziel", async ({ browser }) => {
    const dora = await openGoals(browser, "dl@test.com");
    const item = dora.getByRole("listitem").filter({ hasText: "Fritz Fleißig" });
    await expect(item).toContainText("davon KV-Punkte: 3");
    await item.getByRole("button", { name: "Freigeben" }).click();
    const dialog = dora.getByRole("dialog", { name: "Ziel freigeben" });
    await dialog.getByRole("button", { name: "Freigeben" }).click(); // comment is optional
    await expect(dialog).toBeHidden();
    await expect(dora.getByText("Zur Freigabe (1)")).toHaveCount(0);

    const page = await openGoals(browser, "fa@test.com");
    await expect(page.getByRole("note")).toContainText("erneut eingereicht");
    await page.goto("/vertrieb");
    await expect(page.getByText(/ggü\. Ziel 20 P/)).toBeVisible();
    await expect(page.getByText("Prognose Monatsende")).toBeVisible();
    await expect(page.getByText(/Hochrechnung: bisheriges Tempo/)).toBeVisible();
  });

  test("P3-GOAL-01: Finanzen und Datenschutz sehen Ziele, entscheiden aber nicht", async ({ browser }) => {
    // Paula submits a goal for next month; it stays submitted for the rest of the file.
    const paula = apiSession("punkte@test.com");
    const id = await rpc<string>(paula, "rpc_save_goal_draft", { p_month: month(1), p_targets: { points: 12 } });
    await rpc(paula, "rpc_submit_goal", { p_goal_id: id });

    for (const email of ["finance@test.com", "compliance@test.com"]) {
      const goals = await select<{ id: string; can_review: boolean }[]>(apiSession(email), `v_goals?id=eq.${id}&select=id,can_review`);
      expect(goals, `${email} sees the goal`).toHaveLength(1);
      expect(goals[0].can_review, `${email} may not decide`).toBe(false);
      await refused(rpc(apiSession(email), "rpc_review_goal", { p_goal_id: id, p_decision: "approved" }), "forbidden");
    }
    const page = await openGoals(browser, "finance@test.com");
    await expect(page.getByText(/Zur Freigabe \(/)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Freigeben" })).toHaveCount(0);

    const tina = await select<{ can_review: boolean }[]>(apiSession("tl2@test.com"), `v_goals?id=eq.${id}&select=can_review`);
    expect(tina[0].can_review).toBe(true);
  });

  test("P3-GOAL-02: Kommentare sind begrenzt; Vergangenheit und ferne Zukunft sind geschlossen (API)", async () => {
    const fritz = apiSession("fa@test.com");
    await refused(rpc(fritz, "rpc_save_goal_draft", { p_month: month(-1), p_targets: { points: 1 } }), "month_closed");
    await refused(rpc(fritz, "rpc_save_goal_draft", { p_month: month(3), p_targets: { points: 1 } }), "month_too_far");
    await refused(rpc(fritz, "rpc_save_goal_draft", { p_month: month(2), p_targets: { points: 5, kv_points: 6 } }), "kv_above_points");
    const id = await rpc<string>(fritz, "rpc_save_goal_draft", { p_month: month(2), p_targets: { points: 5 } });
    await refused(rpc(fritz, "rpc_submit_goal", { p_goal_id: id, p_comment: "x".repeat(4001) }), "text_too_long");
    await refused(rpc(fritz, "rpc_review_goal", { p_goal_id: id, p_decision: "approved" }), "cannot_review_own");
  });
});

test.describe("Team-Dashboard (§7.3)", () => {
  test("P3-TEAM-01: Tinas Struktur zeigt den Karrierestatus auch ohne vorab erzeugte Zeiträume, auf Deutsch", async ({ browser }) => {
    sql(`delete from public.career_periods where employee_id = '${emp("fa@test.com")}'`);
    const page = await open(browser, "tl2@test.com", "/vertrieb");
    await expect(page.getByText("Meine Struktur")).toBeVisible();
    const fritz = page.getByRole("row").filter({ hasText: "Fritz Fleißig" });
    await expect(fritz).toContainText(/in Arbeit|qualifiziert/);
    const nora = page.getByRole("row").filter({ hasText: "Nora Ohnestufe" });
    await expect(nora).toContainText("nicht berechenbar");
    await expect(page.getByText("blocked")).toHaveCount(0);
    await expect(page.getByText("no_period")).toHaveCount(0);
    await expect(fritz).toContainText("Freigegeben"); // this month's goal
  });
});

test.describe("Profil & Coaching (§8)", () => {
  test("Tina dokumentiert ein Gespräch mit Maßnahme und eine private Notiz", async ({ browser }) => {
    const page = await open(browser, "tl2@test.com", `/vertrieb/team/${emp("fa@test.com")}`);
    await expect(page.getByRole("heading", { name: "Fritz Fleißig" })).toBeVisible();
    await expect(page.getByText("Anrechenbare Punkte je Monat, letzte 12 Monate")).toBeVisible();
    await page.getByLabel("Zusammenfassung (für die Person sichtbar)").fill("Monatsgespräch: Fokus KV-Beratung");
    await page.getByLabel("Vereinbarte Maßnahme (optional)").fill("Zwei KV-Termine pro Woche");
    await page.getByRole("button", { name: "Gespräch speichern" }).click();
    await expect(page.getByText("Gespräch gespeichert")).toBeVisible();
    await expect(page.getByText("Zwei KV-Termine pro Woche")).toBeVisible();
    await expect(page.getByText(/Monatsgespräch: Fokus KV-Beratung/)).toBeVisible();

    await page.getByLabel("Notiz", { exact: true }).fill("Wirkt unsicher bei Einwänden; Rollenspiel anbieten");
    await page.getByRole("button", { name: "Notiz speichern" }).click();
    await expect(page.getByText("Notiz gespeichert")).toBeVisible();
    await expect(page.getByText("privat", { exact: true })).toBeVisible();
  });

  test("Dora sieht die private Notiz; Fritz, Finanzen und Kollegen nicht (§8.4, §12.1)", async ({ browser }) => {
    const page = await open(browser, "dl@test.com", `/vertrieb/team/${emp("fa@test.com")}`);
    await expect(page.getByText("Wirkt unsicher bei Einwänden; Rollenspiel anbieten")).toBeVisible();
    await expect(page.getByText("privat", { exact: true })).toBeVisible();

    const fritz = emp("fa@test.com");
    expect(await select(apiSession("fa@test.com"), `coaching_notes?employee_id=eq.${fritz}&select=id`)).toEqual([]);
    expect(await select(apiSession("fa@test.com"), `coaching_sessions?employee_id=eq.${fritz}&select=id`)).toHaveLength(1);
    expect(await select(apiSession("finance@test.com"), `coaching_sessions?employee_id=eq.${fritz}&select=id`)).toEqual([]);
    expect(await select(apiSession("finance@test.com"), `coaching_notes?employee_id=eq.${fritz}&select=id`)).toEqual([]);
    await refused(rpc(apiSession("fb.b@test.com"), "rpc_performance_profile", { p_employee_id: fritz }), "forbidden");
    await refused(rpc(apiSession("finance@test.com"), "rpc_performance_profile", { p_employee_id: fritz }), "forbidden");
    expect(sql(`select new_values ->> 'body' from audit.events where entity_type = 'public.coaching_notes' order by id desc limit 1`)).toBe("[redacted]");
  });

  test("P3-COACH-02: die Verwaltung sieht das Profil ohne Coaching und ohne Formulare", async ({ browser }) => {
    const fritz = emp("fa@test.com");
    const profile = await rpc<{ can_coach: boolean; next_review_on: string | null }>(apiSession("admin@test.com", true), "rpc_performance_profile", { p_employee_id: fritz });
    expect(profile.can_coach).toBe(false);
    expect(profile.next_review_on).toBeNull();

    const page = await open(browser, "admin@test.com", `/vertrieb/team/${fritz}`, { aal2: true });
    await expect(page.getByRole("heading", { name: "Fritz Fleißig" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Gespräch speichern" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Notiz speichern" })).toHaveCount(0);
    await expect(page.getByText("Wirkt unsicher bei Einwänden")).toHaveCount(0);
  });

  test("Fritz sieht die vereinbarte Maßnahme auf dem Dashboard und hakt sie ab (§8.4)", async ({ browser }) => {
    const page = await open(browser, "fa@test.com", "/vertrieb");
    await expect(page.getByText("Vereinbarte Maßnahmen")).toBeVisible();
    await page.getByRole("checkbox", { name: /Zwei KV-Termine pro Woche/ }).click();
    await expect(page.getByText("Vereinbarte Maßnahmen")).toHaveCount(0);
    expect(sql(`select status from public.coaching_actions where title = 'Zwei KV-Termine pro Woche'`)).toBe("done");
  });

  test("P3-COACH-01: Texte sind begrenzt, falsche Angaben werden benannt (API)", async () => {
    const tina = apiSession("tl2@test.com");
    const fritz = emp("fa@test.com");
    await refused(rpc(tina, "rpc_add_coaching_note", { p_employee_id: fritz, p_visibility: "secret", p_body: "x" }), "invalid_input");
    await refused(rpc(tina, "rpc_add_coaching_note", { p_employee_id: fritz, p_visibility: "shared", p_body: "x".repeat(4001) }), "text_too_long");
    await refused(rpc(tina, "rpc_add_coaching_session", { p_employee_id: fritz, p_held_on: month(0), p_summary: "Gespräch", p_participants: "p".repeat(501) }), "text_too_long");
    await refused(rpc(tina, "rpc_add_coaching_session", { p_employee_id: fritz, p_held_on: "2099-01-01", p_summary: "Zukunft" }), "date_in_future");
    await refused(rpc(apiSession("fa@test.com"), "rpc_add_coaching_note", { p_employee_id: fritz, p_visibility: "shared", p_body: "über mich" }), "forbidden");
  });
});

test.describe("Karriere-Simulator (§7.4)", () => {
  test("Fritz: +3 KV-Punkte würden die Qualifikation für FB erreichen (nichts wird gespeichert)", async ({ browser }) => {
    const page = await open(browser, "fa@test.com", "/vertrieb/karriere");
    await expect(page.getByText("Schätzung – wird nicht gespeichert")).toBeVisible();
    await page.getByLabel("Zusätzliche eigene KV-Punkte").fill("3");
    await expect(page.getByText(/wäre die Qualifikation für FB erreicht/)).toBeVisible();
    await page.getByLabel("Zusätzliche eigene KV-Punkte").fill("");
    expect(sql(`select count(*) from public.career_level_history where employee_id = '${emp("fa@test.com")}'`)).toBe("1");
  });
});
