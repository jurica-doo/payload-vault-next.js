// Phase 2 · commission engine (requirements1/phase-2-commission; spec §5.3, §6.1–6.4, §14.2, §12.2).
// Uses the Phase 1 fill: every record is confirmed on the business date, so the ledger entries
// sit in the current month. Entries are append-only, so the tests assert on the bookings of one
// production record (stable even when other files add production later), never on month totals.
// Data this file changes: statement status of a month two months back, subsidies for Ben and
// Anna. No other file asserts on those.
import { expect, test, type Browser, type Page } from "@playwright/test";
import { ApiError, rpc, select } from "../lib/api.mts";
import { sql, sqlJson } from "../lib/db.mts";
import { readState } from "../lib/state.mts";
import { loginAs, pick } from "./helpers";
import { apiSession } from "./sessions";

const state = () => readState();
const month = (offset: number) => {
  const [y, m] = state().businessDate.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + offset, 1));
  return d.toISOString().slice(0, 7); // YYYY-MM
};
const fin2 = () => apiSession("finance@test.com", true);
const fin1 = () => apiSession("finance@test.com", false);

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

async function confirmReason(page: Page, button: string, reason: string) {
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Begründung").fill(reason);
  await dialog.getByRole("button", { name: button }).click();
  await expect(dialog).toBeHidden();
}

test.describe.configure({ mode: "serial" });

type Entry = { last_name: string; commission_type: string; relationship: string; gross: string; reserve: string; net: string; rate: string };
let fritzSach = "";
let entries: Entry[] = [];

test.beforeAll(() => {
  fritzSach = sql(`select pr.id from public.production_records pr join public.employees e on e.id = pr.producer_id
                    where e.email = 'fa@test.com' and pr.product_reference = 'Sach 18.618,60 € netto'`);
  entries = sqlJson<Entry>(`select e.last_name, l.commission_type, l.relationship, l.gross_amount::text as gross,
                                   l.reserve_amount::text as reserve, l.net_after_reserve::text as net, l.rate_per_point::text as rate
                              from public.commission_ledger l join public.employees e on e.id = l.recipient_id
                             where l.production_id = '${fritzSach}' and l.entry_kind = 'original' order by l.seq`);
});

test.describe("Ledger (§5.3, §6.1, §14.2)", () => {
  test("Fritz' Sach-Vertrag (93 P): Eigenprovision 2.604 / 260,40 / 2.343,60 und die Kette Tina → Dora", () => {
    // FA 28 €/P; TL 70 − 28 = 42 €/P (direct); DL 112 − 70 = 42 €/P (indirect). 10 % reserve on each.
    expect(entries).toEqual([
      { last_name: "Fleißig", commission_type: "personal", relationship: "self", gross: "2604.00", reserve: "260.40", net: "2343.60", rate: "28.00" },
      { last_name: "Teamleiterin", commission_type: "differential", relationship: "direct", gross: "3906.00", reserve: "390.60", net: "3515.40", rate: "42.00" },
      { last_name: "Direktor", commission_type: "differential", relationship: "indirect", gross: "3906.00", reserve: "390.60", net: "3515.40", rate: "42.00" },
    ]);
    // Total = DL rate × points: nothing is paid twice (§5.4).
    expect(entries.reduce((s, e) => s + Number(e.gross), 0)).toBe(112 * 93);
  });

  test("Kfz erzeugt AE, aber keine Provision (Stand 01.11.2026)", () => {
    const n = sql(`select count(*) from public.commission_ledger l join public.production_records pr on pr.id = l.production_id
                    where pr.category_code = 'KFZ'`);
    expect(n).toBe("0");
  });

  test("Storno spiegelt jede Buchung exakt (Paulas stornierte KV)", () => {
    const rows = sqlJson<{ kind: string; total: string }>(`select l.entry_kind as kind, sum(l.gross_amount)::text as total
        from public.commission_ledger l join public.production_records pr on pr.id = l.production_id
       where pr.product_reference = 'KV storniert' group by l.entry_kind`);
    const original = rows.find((r) => r.kind === "original");
    const reversal = rows.find((r) => r.kind === "reversal");
    expect(original && reversal).toBeTruthy();
    expect(Number(original!.total) + Number(reversal!.total)).toBe(0);
  });
});

test.describe("Eigene Abrechnung (/vertrieb/provisionen)", () => {
  test("Fritz sieht Brutto, Reserve und Nach Reserve getrennt; die Buchung erklärt sich", async ({ browser }) => {
    const page = await open(browser, "fa@test.com", "/vertrieb/provisionen");
    await expect(page.getByText("Provision brutto")).toBeVisible();
    await expect(page.getByText("Reserve (10 %)")).toBeVisible(); // ratio from the booked amounts, not hard-coded
    await expect(page.getByText(/netto|auszahlung/i)).toHaveCount(0);
    const row = page.getByRole("row").filter({ hasText: "2.604,00 €" }).first();
    await expect(row).toContainText("Eigen");
    await expect(row).toContainText("2.343,60 €");
    await row.click();
    const dialog = page.getByRole("dialog", { name: "Provisionsbuchung" });
    await expect(dialog).toContainText("FA → FA");
    await expect(dialog).toContainText("260,40 €");
    await expect(dialog).toContainText("Reserve = 10 % von Brutto");
  });

  test("Tina (TL) sieht die Differenz auf Fritz direkt, Dora (DL) indirekt", async ({ browser }) => {
    const tina = await open(browser, "tl2@test.com", "/vertrieb/provisionen");
    const direct = tina.getByRole("row").filter({ hasText: "Differenz direkte Struktur" });
    await expect(direct).not.toContainText("(0)");
    await expect(tina.getByRole("row").filter({ hasText: "Fritz Fleißig" }).filter({ hasText: "3.906,00 €" }).first()).toBeVisible();

    const dora = await open(browser, "dl@test.com", "/vertrieb/provisionen");
    const indirect = dora.getByRole("row").filter({ hasText: "Differenz indirekte Struktur" });
    await expect(indirect).not.toContainText("(0)");
    await expect(dora.getByRole("row").filter({ hasText: "Fritz Fleißig" }).filter({ hasText: "3.906,00 €" }).first()).toBeVisible();
  });

  test("OD-17: eine Führungskraft liest keine fremde Abrechnung; Kollegen sehen keine fremden Buchungen (API)", async () => {
    const fritz = state().employees["fa@test.com"];
    await refused(rpc(apiSession("tl2@test.com"), "rpc_statement", { p_month: `${month(0)}-01`, p_employee_id: fritz }), "forbidden");
    const ben = await select<{ id: string }[]>(apiSession("fb.b@test.com"), `v_commission_ledger?recipient_id=eq.${fritz}&select=id`);
    expect(ben).toEqual([]);
    const tina = await select<{ id: string }[]>(apiSession("tl2@test.com"), `commission_ledger?recipient_id=eq.${fritz}&select=id`);
    expect(tina).toEqual([]);
  });
});

test.describe("Finanzen (/vertrieb/provisionen/abrechnung)", () => {
  test("ohne 2FA: Hinweis, keine Statuswechsel, kein Export (P2-EXPORT-01)", async ({ browser }) => {
    const page = await open(browser, "finance@test.com", "/vertrieb/provisionen/abrechnung");
    await expect(page.getByRole("note")).toContainText("Zwei-Faktor");
    await expect(page.getByRole("button", { name: "Zur Prüfung" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "CSV" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Zuschuss speichern" })).toBeDisabled();
    await refused(rpc(fin1(), "rpc_log_export", { p_kind: "statement_overview", p_scope: { month: `${month(0)}-01` }, p_row_count: 1 }), "mfa_required");
  });

  test("Monatsworkflow: offen → in Prüfung → freigegeben → ausgezahlt (Vormonate), Freigabe ist endgültig", async ({ browser }) => {
    const page = await open(browser, "finance@test.com", "/vertrieb/provisionen/abrechnung", { aal2: true });
    await page.getByLabel("Abrechnungsmonat").fill(month(-2));
    await expect(page.getByText("Offen", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Zur Prüfung" }).click();
    await confirmReason(page, "Zur Prüfung", "E2E: Prüfung des Monats");
    await expect(page.getByText("In Prüfung", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Wieder öffnen" })).toBeVisible();

    await page.getByRole("button", { name: "Freigeben" }).click();
    await expect(page.getByRole("dialog")).toContainText("unveränderlich");
    await confirmReason(page, "Freigeben", "E2E: Freigabe des Monats");
    await expect(page.getByText("Freigegeben", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Als ausgezahlt markieren" }).click();
    await confirmReason(page, "Als ausgezahlt markieren", "E2E: Auszahlung gebucht");
    await expect(page.getByText("Ausgezahlt", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Zur Prüfung" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Wieder öffnen" })).toHaveCount(0);

    // Locked for subsidies too (§14.3: approved statements never change).
    await refused(rpc(fin2(), "rpc_set_subsidy", {
      p_employee_id: state().employees["fb.b@test.com"], p_month: `${month(-2)}-01`, p_amount: 100,
      p_coverage_note: "Nachtrag", p_reason: "E2E: Nachtrag in gesperrtem Monat",
    }), "period_locked");
    // Every step is audited with its reason (§12.3).
    const audited = sqlJson<{ status: string; reason: string }>(`select new_values ->> 'status' as status, reason from audit.events
        where entity_type = 'public.statement_periods' and reason like 'E2E:%' and new_values ->> 'status' <> 'open' order by id`);
    expect(audited).toEqual([
      { status: "reviewed", reason: "E2E: Prüfung des Monats" },
      { status: "approved", reason: "E2E: Freigabe des Monats" },
      { status: "paid", reason: "E2E: Auszahlung gebucht" },
    ]);
  });

  test("offen → freigegeben ist kein erlaubter Übergang (API)", async () => {
    // The running month stays open on purpose (bookings land there); pgTAP 100 covers month_not_ended.
    await refused(rpc(fin2(), "rpc_set_statement_status", { p_month: `${month(0)}-01`, p_status: "approved", p_reason: "E2E: direkt freigeben" }), "invalid_transition");
  });

  test("Zuschuss: 600 € für FB Ben nur mit Ausnahme-Begründung; die Abrechnung zeigt ihn getrennt (§6.3, §6.4)", async ({ browser }) => {
    const page = await open(browser, "finance@test.com", "/vertrieb/provisionen/abrechnung", { aal2: true });
    await pick(page, "Person", "Beta, Ben");
    await page.getByLabel("Genehmigter Betrag").fill("600,00");
    await page.getByLabel("Deckungsgrundlage").fill("E2E: Struktur B deckt den Zuschuss");
    await page.getByLabel(/^Begründung/).fill("E2E: Zuschuss laut Vereinbarung"); // not "Ausnahme-Begründung"
    await page.getByRole("button", { name: "Zuschuss speichern" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Höchstbetrag" })).toBeVisible();

    await page.getByLabel("Ausnahme-Begründung (optional)").fill("E2E: Sondervereinbarung GF");
    await page.getByRole("button", { name: "Zuschuss speichern" }).click();
    await expect(page.getByText("Zuschuss gespeichert")).toBeVisible();
    await expect(page.getByRole("row").filter({ hasText: "Beta, Ben" })).toContainText("600,00 €"); // overview lists "Nachname, Vorname"

    const ben = await open(browser, "fb.b@test.com", "/vertrieb/provisionen");
    await expect(ben.getByText("Zuschuss (genehmigt)")).toBeVisible();
    await expect(ben.getByText("Höchstbetrag der Stufe: 500,00 €")).toBeVisible();
    await expect(ben.getByText("Höchstbetrag der Stufe: 500,00 €").locator("xpath=..")).toContainText("600,00 €");
  });

  test("P2-SUBSIDY-01: kein Zuschuss für inaktive Personen, FA nur mit Ausnahme (API)", async () => {
    await refused(rpc(fin2(), "rpc_set_subsidy", {
      p_employee_id: state().employees["inactive@test.com"], p_month: `${month(0)}-01`, p_amount: 100,
      p_coverage_note: "Volumen gedeckt", p_reason: "E2E: Zuschuss für inaktive Person",
    }), "owner_inactive");
    await refused(rpc(fin2(), "rpc_set_subsidy", {
      p_employee_id: state().employees["fa@test.com"], p_month: `${month(0)}-01`, p_amount: 100,
      p_coverage_note: "Einstieg", p_reason: "E2E: Zuschuss für FA ohne Ausnahme",
    }), "subsidy_above_maximum");
  });

  test("P2-TASK-01: Zuschuss des Vormonats ohne Entscheidung → Prüfaufgabe für Finanzen (§11.2)", async ({ browser }) => {
    const anna = state().employees["fb.a@test.com"];
    await rpc(fin2(), "rpc_set_subsidy", {
      p_employee_id: anna, p_month: `${month(-1)}-01`, p_amount: 300,
      p_coverage_note: "E2E: Vormonat gedeckt", p_reason: "E2E: Zuschuss Vormonat Anna",
    });
    sql("select app_private.run_subsidy_review_tasks()"); // only this generator: the lead/goal generators belong to other files running in parallel
    const page = await open(browser, "finance@test.com", "/vertrieb/aufgaben", { aal2: true });
    await expect(page.getByText(/Zuschuss prüfen: Anna Alpha/)).toBeVisible();

    await rpc(fin2(), "rpc_set_subsidy", {
      p_employee_id: anna, p_month: `${month(0)}-01`, p_amount: 0,
      p_coverage_note: "E2E: Volumen nicht gedeckt", p_reason: "E2E: kein Zuschuss in diesem Monat",
    });
    sql("select app_private.run_subsidy_review_tasks()"); // only this generator: the lead/goal generators belong to other files running in parallel
    expect(sql(`select count(*) from public.tasks where type = 'subsidy_review' and status = 'open' and linked_id = '${anna}'`)).toBe("0");
  });
});
