// Phase 1 · rules config (r1-p1-rules-config.md; spec §2, §3, §4.4)
import { expect, test } from "@playwright/test";
import { rpc, select, signIn } from "../lib/api.mts";
import { readState } from "../lib/state.mts";
import { loginAs } from "./helpers";
import { apiSession } from "./sessions";

// Spec §2: level, rate per point, max subsidy, threshold.
const LEVELS = [
  ["FA", "28,00 €", "–", "0 P"],
  ["FB", "56,00 €", "500,00 €", "100 P"],
  ["TL", "70,00 €", "1.000,00 €", "300 P"],
  ["OL", "92,00 €", "1.500,00 €", "750 P"],
  ["DL", "112,00 €", "2.500,00 €", "1.500 P"],
  ["RL", "132,00 €", "3.500,00 €", "4.000 P"],
  ["VD", "144,00 €", "6.000,00 €", "9.000 P"],
] as const;

/** First day of next month (Berlin), a valid future draft date. */
function nextMonth(): string {
  const [y, m] = readState().businessDate.split("-").map(Number);
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
}

test("gültige Regeln entsprechen der Spezifikation (§2, §3)", async ({ page }) => {
  await loginAs(page, "admin@test.com");
  await page.goto("/admin/regeln");
  const levels = page.getByRole("table").first();
  for (const [code, rate, subsidy, threshold] of LEVELS) {
    const row = levels.getByRole("row").filter({ hasText: new RegExp(`^${code}\\b`) });
    await expect(row).toContainText(rate);
    await expect(row).toContainText(subsidy);
    await expect(row).toContainText(threshold);
  }
  // Structure cap only from OL on (OD-04).
  await expect(levels.getByRole("row").filter({ hasText: /^TL\b/ })).toContainText("–");
  await expect(levels.getByRole("row").filter({ hasText: /^OL\b/ })).toContainText("50");
  const conversion = page.getByRole("table").nth(1);
  const category = (code: string) =>
    conversion.getByRole("row").filter({ has: page.getByRole("cell", { name: code, exact: true }) });
  await expect(category("LV")).toContainText("4.000");
  await expect(category("LV")).toContainText("35 Jahre");
  await expect(category("KV")).toContainText("28");
  await expect(category("SACH")).toContainText("200");
  for (const none of ["KFZ", "STROM", "GAS"]) await expect(category(none)).toContainText("–");
});

test("Entwurf: Änderung markiert, fallende Sätze abgelehnt, verworfen", async ({ page }) => {
  await loginAs(page, "admin@test.com", { aal2: true });
  await page.goto("/admin/regeln");
  // Levels come first on the page, conversion second; only one draft exists at a time.
  const section = page.locator("body");
  await page.getByLabel("Neuer Entwurf").first().fill("E2E-Entwurf");
  await page.getByLabel("Gültig ab").first().fill(nextMonth());
  await page.getByRole("button", { name: "Entwurf anlegen" }).first().click();
  await expect(page.getByText("Entwurf", { exact: true }).first()).toBeVisible();

  const fb = section.getByRole("group", { name: /^FB/ });
  await fb.getByLabel("Satz/P").fill("58");
  await fb.getByRole("button", { name: "Speichern" }).click();
  await expect(fb.locator(".bg-color-secondary\\/15")).toHaveCount(1);

  const tl = section.getByRole("group", { name: /^TL/ });
  await tl.getByLabel("Satz/P").fill("50");
  await tl.getByRole("button", { name: "Speichern" }).click();
  await section.getByRole("button", { name: "Veröffentlichen…" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox").fill("Test: fallende Sätze");
  await dialog.getByRole("button", { name: "Veröffentlichen" }).click();
  await expect(dialog.getByText(/müssen von Stufe zu Stufe steigen/)).toBeVisible();
  await dialog.getByRole("button", { name: "Abbrechen" }).click();

  await section.getByRole("button", { name: "Entwurf verwerfen" }).click();
  await expect(section.getByRole("button", { name: "Entwurf verwerfen" })).toBeHidden();
});

test("Entwürfe sind für Nicht-Admins unsichtbar (API)", async () => {
  const admin = apiSession("admin@test.com", true);
  const draftId = await rpc<string>(admin, "rpc_create_rule_draft", {
    p_kind: "levels",
    p_label: "E2E unsichtbar",
    p_effective_from: nextMonth(),
  });
  try {
    const seen = await select<{ id: string }[]>(await signIn("fa@test.com"), `rule_versions?select=id&id=eq.${draftId}`);
    expect(seen).toHaveLength(0);
    const adminSeen = await select<{ id: string }[]>(admin, `rule_versions?select=id&id=eq.${draftId}`);
    expect(adminSeen).toHaveLength(1);
  } finally {
    await rpc(admin, "rpc_delete_rule_draft", { p_version_id: draftId });
  }
});
