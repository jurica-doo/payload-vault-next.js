// Phase 6 · email templates, campaigns, suppression list — regression tests for the review findings
// (requirements1/phase-6-automation/verification/r1-p6-verification.md). Every test title starts
// with its finding ID. The file creates its own templates, campaigns and addresses (unique per run)
// and cancels the campaigns it activates, so sending stays off and other files are unaffected.
import { expect, test } from "@playwright/test";
import { ApiError, rpc } from "../lib/api.mts";
import { sql } from "../lib/db.mts";
import { loginAs, pick } from "./helpers";
import { apiSession } from "./sessions";

const RUN = Date.now().toString(36);
const admin = () => apiSession("admin@test.com", true);
const comp = () => apiSession("compliance@test.com", true);
const adviser = () => apiSession("fa.a@test.com");

async function refused(promise: Promise<unknown>, key: string) {
  const error = await promise.then(() => null, (e: unknown) => e);
  expect(error, `expected "${key}"`).toBeInstanceOf(ApiError);
  expect((error as ApiError).message).toContain(key);
}

let template = "";

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  template = await rpc<string>(admin(), "rpc_save_email_template", { p_id: null, p_name: `Geburtstag ${RUN}`, p_purpose: "birthday", p_allowed_bases: ["consent"] });
  const version = await rpc<string>(admin(), "rpc_save_template_draft", { p_template_id: template, p_subject: "Alles Gute, {{rufname}}!", p_body: "Liebe/r {{rufname}},\n\nherzlichen Glückwunsch!" });
  await rpc(admin(), "rpc_submit_template_version", { p_version_id: version });
  await rpc(comp(), "rpc_decide_template_version", { p_version_id: version, p_approve: true, p_note: null });
});

test.describe("Datenbank-Regeln", () => {
  test("P6-01 Zeilenumbruch im Betreff wird abgelehnt", async () => {
    await refused(rpc(admin(), "rpc_save_template_draft", { p_template_id: template, p_subject: "Hallo\r\nBcc: x@evil.example", p_body: "Ein ausreichend langer Text." }), "subject_line_break");
  });

  test("P6-03 benannte Fehlerschlüssel statt roher Datenbankfehler", async () => {
    await refused(rpc(admin(), "rpc_save_email_template", { p_id: null, p_name: `geburtstag ${RUN}`, p_purpose: "birthday", p_allowed_bases: ["consent"] }), "template_name_taken");
    await refused(rpc(admin(), "rpc_save_email_template", { p_id: null, p_name: "ab", p_purpose: "birthday", p_allowed_bases: ["consent"] }), "template_name_length");
    await refused(rpc(admin(), "rpc_save_email_template", { p_id: null, p_name: `Leer ${RUN}`, p_purpose: "birthday", p_allowed_bases: [] }), "template_bases_required");
    await refused(rpc(admin(), "rpc_set_email_window", { p_start: "25:00", p_end: "18:00", p_days: [1, 2, 3, 4, 5], p_daily_limit: 500, p_reason: "Test Versandfenster" }), "invalid_time");
    await refused(rpc(admin(), "rpc_set_suppression", { p_email: `x-${RUN}@example.org`, p_suppressed: true, p_reason: "weil", p_note: null }), "suppression_reason_invalid");
  });

  test("P6-02 nur eine Geburtstagskampagne gleichzeitig aktiv", async () => {
    const make = async (name: string) => {
      const id = await rpc<string>(comp(), "rpc_save_campaign", { p_id: null, p_name: name, p_template_id: template, p_kind: "birthday", p_send_on: null });
      await rpc(comp(), "rpc_set_campaign_status", { p_id: id, p_action: "submit", p_reason: null });
      return id;
    };
    const first = await make(`Geburtstage eins ${RUN}`);
    // An active birthday campaign from elsewhere may already exist; either way one is active afterwards.
    await rpc(admin(), "rpc_set_campaign_status", { p_id: first, p_action: "approve", p_reason: null }).catch(() => undefined);
    const second = await make(`Geburtstage zwei ${RUN}`);
    await refused(rpc(admin(), "rpc_set_campaign_status", { p_id: second, p_action: "approve", p_reason: null }), "birthday_campaign_active");
    // Two approvals at the same moment: the lock lets at most one birthday campaign become active.
    const third = await make(`Geburtstage drei ${RUN}`);
    const fourth = await make(`Geburtstage vier ${RUN}`);
    await rpc(admin(), "rpc_set_campaign_status", { p_id: first, p_action: "pause", p_reason: null }).catch(() => undefined);
    await Promise.allSettled([third, fourth].map((id) => rpc(admin(), "rpc_set_campaign_status", { p_id: id, p_action: "approve", p_reason: null })));
    expect(Number(sql("select count(*) from public.email_campaigns where kind = 'birthday' and status = 'active'"))).toBeLessThanOrEqual(1);
    for (const id of [first, second, third, fourth]) {
      await rpc(admin(), "rpc_set_campaign_status", { p_id: id, p_action: "cancel", p_reason: "E2E-Aufräumen nach dem Test" });
    }
  });

  test("P6-07 erneutes Sperren aktualisiert den Grund", async () => {
    const email = `wieder-${RUN}@example.org`;
    await rpc(admin(), "rpc_set_suppression", { p_email: email, p_suppressed: true, p_reason: "manual", p_note: null });
    await rpc(admin(), "rpc_set_suppression", { p_email: email.toUpperCase(), p_suppressed: true, p_reason: "bounce", p_note: "Zustellung gescheitert" });
    expect(sql(`select reason from public.email_suppressions where email = '${email}'`)).toBe("bounce");
  });

  test("P6-13 Import der Sperrliste: Rechte, Zählung, Fehler ohne Adressen", async () => {
    await refused(rpc(adviser(), "rpc_import_suppressions", { p_rows: [{ email: `a-${RUN}@example.org` }] }), "forbidden");
    await refused(rpc(apiSession("compliance@test.com"), "rpc_import_suppressions", { p_rows: [{ email: `a-${RUN}@example.org` }] }), "mfa_required");
    const result = await rpc<{ added: number; already_blocked: number; failed: number; errors: { row: number; code: string }[] }>(comp(), "rpc_import_suppressions", {
      p_rows: [{ email: `A-${RUN}@Example.org` }, { email: `a-${RUN}@example.org` }, { email: "kaputt" }, { email: `b-${RUN}@example.org`, reason: "bounce" }],
      p_reason: "opt_out",
    });
    expect(result).toMatchObject({ added: 2, already_blocked: 0, failed: 2 });
    expect(result.errors).toEqual([{ row: 2, code: "duplicate_in_file" }, { row: 3, code: "invalid_email" }]);
    expect(JSON.stringify(result)).not.toContain("example.org");
    expect(sql(`select reason from public.email_suppressions where email = 'b-${RUN}@example.org'`)).toBe("bounce");
  });
});

test.describe("Oberfläche", () => {
  test("P6-04 Versandfenster mit Zeitauswahl", async ({ page }) => {
    await loginAs(page, "admin@test.com", { aal2: true });
    await page.goto("/vertrieb/kunden/kommunikation");
    await expect(page.getByLabel("Fenster von")).toHaveAttribute("type", "time");
    await expect(page.getByLabel("Fenster bis")).toHaveAttribute("type", "time");
  });

  test("P6-07 Sperren mit Grund, Anzeige auf Deutsch, Suche in der Datenbank", async ({ page }) => {
    const email = `ui-${RUN}@example.org`;
    await loginAs(page, "admin@test.com", { aal2: true });
    await page.goto("/vertrieb/kunden/kommunikation");
    await page.getByLabel("E-Mail-Adresse sperren").fill(email);
    await pick(page, "Grund", "Beschwerde");
    await page.getByRole("button", { name: "Sperren", exact: true }).click();
    await page.getByRole("searchbox").fill(`ui-${RUN}`);
    const row = page.locator("li", { hasText: email });
    await expect(row.getByText(/Beschwerde/)).toBeVisible();
    expect(sql(`select reason from public.email_suppressions where email = '${email}'`)).toBe("complaint");
  });

  test("P6-13 CSV-Import der Sperrliste über den Dialog", async ({ page }) => {
    await loginAs(page, "compliance@test.com", { aal2: true });
    await page.goto("/vertrieb/kunden/kommunikation");
    await page.getByRole("button", { name: "CSV importieren" }).click();
    const dialog = page.getByRole("dialog", { name: "Sperrliste importieren" });
    await dialog.getByLabel(/CSV-Datei/).setInputFiles({
      name: "sperrliste.csv", mimeType: "text/csv",
      buffer: Buffer.from(`E-Mail;Grund\r\nimp1-${RUN}@example.org;Abmeldung\r\nimp2-${RUN}@example.org;Unzustellbar\r\nohne-at;\r\n`),
    });
    await dialog.getByRole("button", { name: "3 Adressen sperren" }).click();
    await expect(dialog.getByText(/2\s*Adressen neu gesperrt/)).toBeVisible();
    await expect(dialog.getByText("Keine gültige E-Mail-Adresse").first()).toBeVisible();
    expect(sql(`select string_agg(reason, ',' order by email) from public.email_suppressions where email like 'imp%-${RUN}@example.org'`)).toBe("opt_out,bounce");
  });
});
