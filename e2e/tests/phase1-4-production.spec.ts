// Phase 1 · production + points engine (r1-p1-production.md; spec §3, §14.1, §17.1)
import { expect, test, type Page } from "@playwright/test";
import { importCsv } from "../fixtures/phase1.mts";
import { rpc, select, signIn } from "../lib/api.mts";
import { sql } from "../lib/db.mts";
import { readState } from "../lib/state.mts";
import { loginAs } from "./helpers";
import { apiSession } from "./sessions";

const rowWith = (page: Page, ...texts: (string | RegExp)[]) => {
  let rows = page.getByRole("row");
  for (const t of texts) rows = rows.filter({ hasText: t });
  return rows;
};

test.describe("Paula: jede Punkteregel aus §3 / §14.1", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, "punkte@test.com");
    await page.goto("/vertrieb/produktion");
    await expect(page.getByRole("table")).toBeVisible();
  });

  test("Liste: Punkte und Status je Datensatz", async ({ page }) => {
    await expect(rowWith(page, /(?<![\d.])700,00/)).toContainText("25,00"); // KV 700 € → 25 P
    await expect(rowWith(page, /(?<![\d.])1\.000,00/)).toContainText("5,00"); // Sach 1.000 € netto → 5 P
    await expect(rowWith(page, "333,33")).toContainText("11,90"); // KV 333,33 € → 11,9046 P
    await expect(rowWith(page, "KFZ")).toContainText("Anrechenbar"); // Kfz → 0 P
    await expect(rowWith(page, /(?<![\d.])280,00/)).toContainText("Storniert");
    await expect(rowWith(page, "STROM")).toContainText("Eingereicht");
    await expect(rowWith(page, "GAS")).toContainText("Entwurf");
    // Producers can't confirm their own production.
    await expect(rowWith(page, "STROM").getByRole("button", { name: "Anrechenbar" })).toHaveCount(0);
  });

  test("Details: Woher kommt diese Zahl? (KV 333,33 €)", async ({ page }) => {
    await rowWith(page, "333,33").first().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("333.33 ÷ 28"); // Formel
    await expect(dialog).toContainText("11.9046428571"); // Ergebnis exakt
    await expect(dialog).toContainText("Punkte (gerundet)");
    await expect(dialog).toContainText("11,90");
  });

  test("Details: Korrektur als Buchung, Storno, Neuberechnung (12,60 → −12,60 → 10,50)", async ({ page }) => {
    const id = readState().production["paula-lv-corrected"];
    const ledger = sql(`select string_agg(round(points, 2)::text, ' ' order by seq) from public.point_calculations where production_id = '${id}'`);
    expect(ledger).toBe("12.60 -12.60 10.50");
    // Three LV 100 € rows are eligible with 10,50 P; open them until the corrected one.
    const candidates = rowWith(page, "LV", /(?<![\d.])100,00/, "Anrechenbar");
    const dialog = page.getByRole("dialog");
    for (let i = 0; i < (await candidates.count()); i++) {
      await candidates.nth(i).click();
      await expect(dialog).toContainText("Buchungen");
      if ((await dialog.textContent())?.includes("Rückbuchung")) break;
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
    }
    await expect(dialog).toContainText("Rückbuchung");
    await expect(dialog).toContainText("12,60");
    await expect(dialog).toContainText("-12,60");
    await expect(dialog).toContainText("Beitrag laut Police korrigiert");
  });

  test("Erfassen: Live-Vorschau LV 100 € × 35 J. = 10,50 P, 40 J. mit OD-06-Hinweis", async ({ page }) => {
    await page.getByRole("button", { name: "Produktion erfassen" }).click();
    const dialog = page.getByRole("dialog", { name: "Produktion erfassen" });
    await dialog.getByLabel("Sparte").selectOption("LV");
    await dialog.getByLabel("Beitrag").fill("100,00");
    await dialog.getByLabel("Laufzeit").fill("35");
    await expect(dialog).toContainText("10,50");
    await dialog.getByLabel("Laufzeit").fill("40");
    await expect(dialog.getByText("Laufzeit über 35 Jahre wird in der Formel mit 35 Jahren gerechnet.")).toBeVisible();
    await expect(dialog).toContainText("10,50");
    await dialog.getByRole("button", { name: "Abbrechen" }).click();
  });
});

test("Finanzen bestätigt eingereichte Produktion (Strom → 0 P, anrechenbar)", async ({ page }) => {
  await loginAs(page, "finance@test.com", { aal2: true });
  await page.goto("/vertrieb/produktion");
  const strom = rowWith(page, "Punkte, Paula", "STROM");
  await expect(strom).toContainText("Eingereicht");
  await strom.getByRole("button", { name: "Anrechenbar" }).click();
  await expect(strom).toContainText("Anrechenbar");
});

test("Sichtbarkeit: Fritz sieht nur seine eigene Produktion (API)", async () => {
  const rows = await select<{ producer_id: string }[]>(await signIn("fa@test.com"), "v_production?select=producer_id");
  const fritz = readState().employees["fa@test.com"];
  expect(rows.length).toBeGreaterThan(0);
  expect(rows.every((r) => r.producer_id === fritz)).toBe(true);
});

test("Punkte-Ledger ist unveränderlich, auch für postgres", async () => {
  expect(() => sql("update public.point_calculations set points = 1 where seq = (select max(seq) from public.point_calculations)")).toThrow(
    /append_only/,
  );
});

test("CSV-Import: nur gültige Zeilen, jeder Fehler benannt, kein Doppelimport", async ({ page }) => {
  await loginAs(page, "admin@test.com", { aal2: true });
  await page.goto("/vertrieb/produktion/import");
  const csv = { name: "e2e-import.csv", mimeType: "text/csv", buffer: Buffer.from(importCsv(readState().businessDate), "utf8") };

  await page.getByLabel("Quellsystem").fill("E2E");
  await page.locator('input[type="file"]').setInputFiles(csv);
  await page.getByRole("button", { name: "Prüfen" }).click();
  const take = page.getByRole("button", { name: "2 gültige Zeilen übernehmen" });
  await expect(take).toBeVisible();
  const table = page.getByRole("table");
  await expect(rowWith(page, "IMP-003")).not.toContainText("OK");
  await expect(table).toContainText(/Pers\.-Nr\.|Personalnummer/);
  await take.click();
  await expect(take).toBeHidden();
  expect(sql("select count(*) from public.production_records where source_system = 'E2E'")).toBe("2");

  // Same file again: everything is already imported.
  await page.goto("/vertrieb/produktion/import");
  await page.getByLabel("Quellsystem").fill("E2E");
  await page.locator('input[type="file"]').setInputFiles(csv);
  await page.getByRole("button", { name: "Prüfen" }).click();
  // Wait for the staging result, then: nothing left to take over (button stays, disabled).
  await expect(page.getByRole("table")).toContainText(/bereits importiert/i);
  await expect(page.getByRole("button", { name: "0 gültige Zeilen übernehmen" })).toBeDisabled();
});

// Findings P1 and P2 from the Phase 1 review (r1-p1-verification.md), fixed since.
test.describe("Import-Prüfung deckt sich mit der Übernahme", () => {
  const row = (businessDate: string, over: Record<string, string>) => ({
    source_id: "", employee_no: "E2E-PUNKTE", category: "KFZ", premium: "500.00", period: "annual",
    net_or_gross: "", term_years: "", production_date: businessDate, reference: "", ...over,
  });

  const rowErrors = (batch: string) => sql(`select errors::text from public.import_rows where batch_id = '${batch}'`);

  test("P1: eine Zeile, die die Übernahme ablehnen würde, ist schon bei der Prüfung ungültig", async () => {
    const state = readState();
    const admin = apiSession("admin@test.com", true);
    // "quartalsweise" isn't a premium period the table accepts
    // (monthly/annual/one_off); the check used to pass it for Kfz.
    const batch = await rpc<string>(admin, "rpc_stage_production_import", {
      p_source_system: "E2E-P1",
      p_file_name: "p1.csv",
      p_rows: [row(state.businessDate, { source_id: "P1-001", period: "quartalsweise" })],
    });
    expect(rowErrors(batch)).toBe("{invalid_premium_period}");
  });

  test("P2: dieselbe Quelle-ID mit anders geschriebenem Quellsystem gilt als bereits importiert", async () => {
    const state = readState();
    const admin = apiSession("admin@test.com", true);
    // IMP-001 was imported above with Quellsystem "E2E".
    const batch = await rpc<string>(admin, "rpc_stage_production_import", {
      p_source_system: "e2e",
      p_file_name: "p2.csv",
      p_rows: [row(state.businessDate, { source_id: "IMP-001", category: "LV", premium: "100.00", period: "monthly", term_years: "35" })],
    });
    expect(rowErrors(batch)).toBe("{already_imported}");
  });
});
