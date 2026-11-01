// Phase 1 · career engine (r1-p1-career-engine.md; spec §4, §14.4, §4.5)
import { expect, test, type Page } from "@playwright/test";
import { EXPECTED_CAREER } from "../fixtures/phase1.mts";
import { ApiError, rpc, signIn } from "../lib/api.mts";
import { readState } from "../lib/state.mts";
import { de, loginAs } from "./helpers";

const THRESHOLDS: Record<string, string> = { FB: "100", TL: "300", OL: "750", DL: "1500" };

/** The calendar day after an ISO date (YYYY-MM-DD). */
const nextDay = (iso: string) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};

async function openCareer(page: Page, email: string): Promise<void> {
  await loginAs(page, email);
  await page.goto("/vertrieb/karriere");
  await expect(page.getByText(/^Punkte für [A-Z]{2}$/)).toBeVisible(); // not the simulator's "Simuliert: …"
}

test.describe("Karriere-Fortschritt je Person (Zählfenster = aktuelle Karriereperiode)", () => {
  for (const [email, want] of Object.entries(EXPECTED_CAREER)) {
    test(`${email}: ${want.note}`, async ({ page }) => {
      await openCareer(page, email);
      const required = THRESHOLDS[want.target];
      // The simulator below repeats the meters; the real ones come first.
      await expect(page.getByText(`Punkte für ${want.target}`, { exact: true })).toBeVisible();
      await expect(page.getByText(new RegExp(`${de(want.points)}\\s*/\\s*${de(required)}`)).first()).toBeVisible();
      await expect(page.getByText(new RegExp(`${de(want.kv)}\\s*/\\s*${de(String(Number(required) / 10))}`)).first()).toBeVisible();
      await expect(page.getByText(want.ready ? "Qualifiziert – Freigabe ausstehend" : "In Arbeit").first()).toBeVisible();
    });
  }

  test("Tim: Struktur A begrenzt (800 → 375), Struktur B voll", async ({ page }) => {
    await openCareer(page, "tl@test.com");
    await expect(page.getByText("Herkunft der Punkte")).toBeVisible();
    const anna = page.getByRole("row").filter({ hasText: "Anna Alpha" }).first();
    await expect(anna).toContainText("begrenzt");
    await expect(anna).toContainText("800,00");
    await expect(anna).toContainText("375,00");
    const ben = page.getByRole("row").filter({ hasText: "Ben Beta" }).first();
    await expect(ben).not.toContainText("begrenzt");
    await expect(ben).toContainText("300,00");
  });

  test("Nora ohne Stufe: kein Fortschritt berechenbar", async ({ page }) => {
    await loginAs(page, "nolevel@test.com");
    await page.goto("/vertrieb/karriere");
    await expect(page.getByText("Kein Fortschritt berechenbar")).toBeVisible();
  });

  test("Fritz darf Tims Fortschritt nicht sehen (API)", async () => {
    const error = await rpc(await signIn("fa@test.com"), "rpc_career_progress", {
      p_employee_id: readState().employees["tl@test.com"],
    }).then(
      () => null,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).message).toContain("forbidden");
  });
});

test("Beförderungen: Warteschlange zeigt genau die Qualifizierten", async ({ page }) => {
  await loginAs(page, "admin@test.com", { aal2: true });
  await page.goto("/admin/befoerderungen");
  const table = page.getByRole("table");
  await expect(table.getByRole("row").filter({ hasText: "Tim Teamleiter" })).toContainText("TL → OL");
  await expect(table.getByRole("row").filter({ hasText: "Anna Alpha" })).toContainText("FB → TL");
  await expect(table.getByRole("row").filter({ hasText: "Ben Beta" })).toContainText("FB → TL");
  await expect(table).not.toContainText("Fritz");
  await expect(table).not.toContainText("Paula");
});

test("§14.4: Fritz ergänzt KV 84 € → nach Bestätigung qualifiziert", async ({ browser }) => {
  const fritzPage = await browser.newPage();
  await loginAs(fritzPage, "fa@test.com");
  await fritzPage.goto("/vertrieb/produktion");
  await fritzPage.getByRole("button", { name: "Produktion erfassen" }).click();
  const dialog = fritzPage.getByRole("dialog", { name: "Produktion erfassen" });
  await dialog.getByLabel("Sparte").selectOption("KV");
  await dialog.getByLabel("Beitrag").fill("84,00");
  await expect(dialog).toContainText("3,00");
  await dialog.getByRole("button", { name: "Speichern & einreichen" }).click();
  await expect(fritzPage.getByRole("row").filter({ hasText: "84,00" })).toContainText("Eingereicht");

  const financePage = await browser.newPage();
  await loginAs(financePage, "finance@test.com", { aal2: true });
  await financePage.goto("/vertrieb/produktion");
  const row = financePage.getByRole("row").filter({ hasText: "Fleißig, Fritz" }).filter({ hasText: "84,00" });
  await row.getByRole("button", { name: "Anrechenbar" }).click();
  await expect(row).toContainText("Anrechenbar");

  await fritzPage.goto("/vertrieb/karriere");
  await expect(fritzPage.getByText(/103,00\s*\/\s*100,00/).first()).toBeVisible();
  await expect(fritzPage.getByText(/10,00\s*\/\s*10,00/).first()).toBeVisible();
  await expect(fritzPage.getByText("Qualifiziert – Freigabe ausstehend").first()).toBeVisible();
});

test("Beförderung freigeben: Tim wird OL, Zählung beginnt neu", async ({ page }) => {
  await loginAs(page, "admin@test.com", { aal2: true });
  await page.goto("/admin/befoerderungen");
  await page.getByRole("row").filter({ hasText: "Tim Teamleiter" }).getByRole("button", { name: "Freigeben" }).click();
  const dialog = page.getByRole("dialog", { name: "Beförderung freigeben" });
  await dialog.getByRole("textbox").fill("Qualifikation laut Karriereprüfung erreicht");
  await dialog.getByRole("button", { name: "Zu OL befördern" }).click();
  await expect(page.getByRole("row").filter({ hasText: "Tim Teamleiter" })).toHaveCount(0);

  const tim = await signIn("tl@test.com");
  const context = await rpc<{ employee: { level_code: string } }>(tim, "rpc_my_context");
  expect(context.employee.level_code).toBe("OL");
  const progress = await rpc<{ target: string; window: { start: string } }>(tim, "rpc_career_progress");
  expect(progress.target).toBe("DL");
  // OD-02 (provisional): counting restarts the day after the promotion; the
  // promotion day itself still belongs to the old level (finding K1).
  expect(progress.window.start).toBe(nextDay(readState().businessDate));
});

// K1: all fill data is dated today, the promotion day. It counted for OL and
// again for DL; now Tim's new window starts empty.
test("K1: Produktion vom Beförderungstag zählt nicht doppelt", async () => {
  const progress = await rpc<{ eligible: number }>(await signIn("tl@test.com"), "rpc_career_progress");
  expect(Number(progress.eligible)).toBe(0);
});
