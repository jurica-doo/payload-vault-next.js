// Phase 1 · hierarchy (r1-p1-hierarchy.md; spec §5.1, §14.3)
import { expect, test, type Page } from "@playwright/test";
import { ApiError, rpc } from "../lib/api.mts";
import { berlinToday } from "../lib/env.mts";
import { readState } from "../lib/state.mts";
import { loginAs, pick, sidebarLabels } from "./helpers";
import { apiSession } from "./sessions";

async function treeNames(page: Page): Promise<string[]> {
  const tree = page.getByRole("tree");
  await expect(tree).toBeVisible();
  return (await tree.getByRole("treeitem").allInnerTexts()).map((t) => t.replace(/\s+/g, " ").trim());
}

test.describe("Team: jede Person sieht genau ihre Struktur (heute)", () => {
  test("FB Anna: sich und Ali", async ({ page }) => {
    await loginAs(page, "fb.a@test.com");
    await page.goto("/vertrieb/team");
    const names = await treeNames(page);
    expect(names.join("|")).toContain("Alpha, Anna");
    expect(names.join("|")).toContain("Alpha, Ali");
    expect(names.join("|")).not.toContain("Beta, Ben");
    expect(names.join("|")).not.toContain("Teamleiter, Tim");
  });

  test("TL Tim: Anna, Ali, Ben — weder Dora noch Tinas Struktur", async ({ page }) => {
    await loginAs(page, "tl@test.com");
    await page.goto("/vertrieb/team");
    const joined = (await treeNames(page)).join("|");
    for (const n of ["Teamleiter, Tim", "Alpha, Anna", "Alpha, Ali", "Beta, Ben"]) expect(joined).toContain(n);
    for (const n of ["Direktor, Dora", "Teamleiterin, Tina", "Fleißig, Fritz"]) expect(joined).not.toContain(n);
  });

  test("DL Dora: die ganze Struktur auf einen Blick, die Inaktive markiert", async ({ page }) => {
    const everyone = [
      "Direktor, Dora",
      "Teamleiter, Tim",
      "Alpha, Anna",
      "Alpha, Ali",
      "Beta, Ben",
      "Teamleiterin, Tina",
      "Fleißig, Fritz",
      "Punkte, Paula",
      "Ohnestufe, Nora",
      "Inaktiv, Igor",
    ];
    await loginAs(page, "dl@test.com");
    await page.goto("/vertrieb/team");
    // The tree opens fully expanded, without clicking anything.
    const tree = page.getByRole("tree");
    const joined = (await treeNames(page)).join("|");
    for (const n of everyone) expect(joined).toContain(n);
    expect(joined).not.toContain("Mustermann");
    await expect(tree.getByRole("treeitem").filter({ hasText: "Inaktiv, Igor" }).first()).toContainText(/inaktiv/i);

    await page.getByRole("button", { name: "Alle zuklappen" }).click();
    await expect(tree.getByRole("treeitem")).toHaveCount(1);
    await page.getByRole("button", { name: "Alle aufklappen" }).click();
    await expect(tree.getByRole("treeitem")).toHaveCount(everyone.length);
  });

  test("Berater Fritz: kein Team-Menü, Seite gesperrt", async ({ page }) => {
    await loginAs(page, "fa@test.com");
    await page.goto("/");
    expect(await sidebarLabels(page)).not.toContain("Team");
    await page.goto("/vertrieb/team");
    await expect(page.getByText("Dieser Bereich ist für Sie nicht freigeschaltet.")).toBeVisible();
  });
});

test.describe("Hierarchie verwalten", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, "admin@test.com", { aal2: true });
    await page.goto("/admin/hierarchie");
  });

  test("Verlauf zeigt aktuelle und geplante Zuordnung", async ({ page }) => {
    await pick(page, "Person", "Alpha, Ali");
    await expect(page.getByText("Aktuell", { exact: true })).toBeVisible();
    await expect(page.getByText("Geplant", { exact: true })).toBeVisible();
    await expect(page.getByText(/01\.06\.2027 – offen/)).toBeVisible();
  });

  test("Kreis wird abgelehnt (Dora unter Ali)", async ({ page }) => {
    await pick(page, "Person", "Direktor, Dora");
    await pick(page, "Führungskraft ab Stichtag", "Alpha, Ali");
    await page.getByLabel("Gültig ab").fill(berlinToday());
    await page.getByLabel("Begründung").fill("Test: Kreis in der Struktur");
    await page.getByRole("button", { name: "Zuordnung speichern" }).click();
    await expect(page.getByText(/Kreis in der Struktur/)).toBeVisible();
  });

  test("vor dem Eintrittsdatum wird abgelehnt", async ({ page }) => {
    await pick(page, "Person", "Teamleiter, Tim");
    await pick(page, "Führungskraft ab Stichtag", "Teamleiterin, Tina");
    await page.getByLabel("Gültig ab").fill("2025-12-01");
    await page.getByLabel("Begründung").fill("Test: vor dem Eintritt");
    await page.getByRole("button", { name: "Zuordnung speichern" }).click();
    await expect(page.getByText(/vor dem Eintrittsdatum/)).toBeVisible();
  });

  test("ein früherer Wechsel vor einem geplanten wird abgelehnt", async ({ page }) => {
    await pick(page, "Person", "Alpha, Ali");
    await pick(page, "Führungskraft ab Stichtag", "Teamleiterin, Tina");
    await page.getByLabel("Gültig ab").fill("2027-01-01");
    await page.getByLabel("Begründung").fill("Test: Wechsel vor dem geplanten");
    await page.getByRole("button", { name: "Zuordnung speichern" }).click();
    await expect(page.getByText(/bereits einen geplanten Wechsel/)).toBeVisible();
  });
});

// Finding H1 (back-dated moves) and cancelled moves vanishing (manual test
// 3.10). Each test uses its own employee so the career numbers other tests
// rely on stay untouched.
test.describe("Keine rückwirkenden Wechsel, abgesagte Wechsel bleiben sichtbar", () => {
  async function newEmployee(first: string, last: string, email: string): Promise<string> {
    const state = readState();
    const admin = apiSession("admin@test.com", true);
    const created = await rpc<{ employee_id: string }>(admin, "rpc_create_employee", {
      p_first_name: first,
      p_last_name: last,
      p_email: email,
      p_start_date: "2026-01-01",
    });
    // A first assignment may start in the past (onboarding).
    await rpc(admin, "rpc_assign_manager", {
      p_employee_id: created.employee_id,
      p_manager_id: state.employees["tl2@test.com"],
      p_effective_from: "2026-01-01",
      p_reason: "Test: Startzuordnung",
    });
    return created.employee_id;
  }

  test("H1: ein rückwirkender Wechsel innerhalb der aktuellen Zuordnung wird abgelehnt", async () => {
    const employeeId = await newEmployee("Bo", "Rückwirkend", "bo.rueckwirkend@test.com");
    const error = await rpc(apiSession("admin@test.com", true), "rpc_assign_manager", {
      p_employee_id: employeeId,
      p_manager_id: readState().employees["fb.b@test.com"],
      p_effective_from: "2026-03-01", // in the past, after the current start
      p_reason: "Test: rückwirkender Wechsel",
    }).then(
      () => null,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).message).toContain("retroactive_change");
  });

  test("ein abgesagter Wechsel steht weiter im Verlauf, mit Grund", async ({ page }) => {
    const admin = apiSession("admin@test.com", true);
    const employeeId = await newEmployee("Cleo", "Abgesagt", "cleo.abgesagt@test.com");
    const plannedId = await rpc<string>(admin, "rpc_assign_manager", {
      p_employee_id: employeeId,
      p_manager_id: readState().employees["fb.b@test.com"],
      p_effective_from: "2027-03-01",
      p_reason: "Test: geplanter Wechsel zu Ben",
    });
    await rpc(admin, "rpc_cancel_future_assignment", { p_assignment_id: plannedId, p_reason: "Test: Wechsel abgesagt" });

    await loginAs(page, "admin@test.com", { aal2: true });
    await page.goto("/admin/hierarchie");
    await pick(page, "Person", "Abgesagt, Cleo");
    const cancelled = page.getByRole("listitem").filter({ hasText: "geplant ab 01.03.2027" });
    await expect(cancelled).toContainText("Abgesagt");
    await expect(cancelled).toContainText("Beta, Ben");
    await expect(cancelled).toContainText("Test: Wechsel abgesagt");
    await expect(cancelled.getByRole("button", { name: "Absagen" })).toHaveCount(0);
    await expect(page.getByRole("listitem").filter({ hasText: "Teamleiterin, Tina" })).toContainText("Aktuell");
  });
});
