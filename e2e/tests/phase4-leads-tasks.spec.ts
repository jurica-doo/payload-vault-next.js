// Phase 4 · leads, tasks, activities — regression tests for the review findings
// (requirements1/phase-4-leads-tasks/verification/r1-p4-verification.md). Every test
// title starts with its finding ID. The file creates its own leads through the real
// API (unique names per run), so it doesn't touch data the Phase 1 files assert on.
import { expect, test } from "@playwright/test";
import { ApiError, rpc, select } from "../lib/api.mts";
import { sql } from "../lib/db.mts";
import { loginAs } from "./helpers";
import { apiSession } from "./sessions";

const RUN = Date.now().toString(36);
const phone = (n: number) => `+49176${String(Date.now() % 1e6).padStart(6, "0")}${n}`;
const empId = (no: string) => sql(`select id from public.employees where employee_no = '${no}'`);
const sourceId = (name: string) => sql(`select id from public.lead_sources where name = '${name}'`);

async function refused(promise: Promise<unknown>, key: string) {
  const error = await promise.then(() => null, (e: unknown) => e);
  expect(error, `expected "${key}"`).toBeInstanceOf(ApiError);
  expect((error as ApiError).message).toContain(key);
}

const ali = () => apiSession("fa.a@test.com");
const tim = () => apiSession("tl@test.com");
const tina = () => apiSession("tl2@test.com");

let lenaId = "";
let lenaPhone = "";
let poolId = "";

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  lenaPhone = phone(1);
  lenaId = await rpc<string>(ali(), "rpc_create_lead", {
    p_data: { first_name: "Lena", last_name: `Lead ${RUN}`, phone: lenaPhone, source_id: sourceId("Website"), region: "", priority: "high", product_interest: ["LV"] },
    p_confirm_duplicates: true,
  });
  await rpc(ali(), "rpc_log_activity", {
    p_type: "appointment", p_linked_type: "lead", p_linked_id: lenaId, p_scheduled_at: new Date(Date.now() + 86_400_000).toISOString(),
  });
  poolId = await rpc<string>(tim(), "rpc_create_lead", {
    p_data: { first_name: "Paul", last_name: `Pool ${RUN}`, phone: phone(2), source_id: sourceId("Website") }, p_to_pool: true, p_confirm_duplicates: true,
  });
});

test.describe("Datenbank-Regeln", () => {
  test("P4-SEC-01 Pool-Leads bleiben in der Struktur der anlegenden Führungskraft", async () => {
    expect(await select(tina(), `leads?select=id&id=eq.${poolId}`)).toEqual([]);
    await refused(rpc(tina(), "rpc_assign_lead", { p_lead_id: poolId, p_owner_id: empId("E2E-FA") }), "forbidden");
    await refused(rpc(tina(), "rpc_update_lead", { p_lead_id: poolId, p_data: { region: "fremd" } }), "forbidden");
    expect(await select(apiSession("dl@test.com"), `leads?select=id&id=eq.${poolId}`)).toHaveLength(1);
    expect(await select(ali(), `leads?select=id&id=eq.${poolId}`)).toEqual([]);
  });

  test("P4-DATA-01 ein Termin zählt als Erstkontakt", async () => {
    const [lead] = await select<{ first_contact_at: string | null }[]>(ali(), `leads?select=first_contact_at&id=eq.${lenaId}`);
    expect(lead.first_contact_at).not.toBeNull();
  });

  test("P4-DATA-03 leere optionale Texte werden als NULL gespeichert", async () => {
    const [lead] = await select<{ region: string | null }[]>(ali(), `leads?select=region&id=eq.${lenaId}`);
    expect(lead.region).toBeNull();
  });

  test("P4-API-01/02 unbekannte Felder und zu lange Texte werden mit Schlüssel abgelehnt", async () => {
    await refused(rpc(ali(), "rpc_create_lead", { p_data: { last_name: "Key", foo: 1, source_id: sourceId("Website") } }), "invalid_input");
    await refused(rpc(ali(), "rpc_create_lead", { p_data: { last_name: "Lang", notes: "x".repeat(4001), source_id: sourceId("Website") } }), "text_too_long");
    await refused(rpc(ali(), "rpc_log_activity", { p_type: "appointment" }), "appointment_time_required");
    await refused(rpc(ali(), "rpc_create_task", { p_owner_id: empId("E2E-FA-A"), p_title: "ab" }), "title_too_short");
  });

  test("P4-NOTIF-01 + P4-UX-10 Generatoren: ein Sammel-Hinweis, Systemaufgaben schließen sich selbst", async () => {
    const since = sql("select now()");
    for (const n of [3, 4, 5]) {
      await rpc(ali(), "rpc_create_lead", {
        p_data: { last_name: `Spät ${n} ${RUN}`, phone: phone(n), source_id: sourceId("Website"), received_at: new Date(Date.now() - 10 * 86_400_000).toISOString() },
        p_confirm_duplicates: true,
      });
    }
    sql("select app_private.run_task_generators()");
    const perKind = sql(`select count(*) from public.notifications n join public.employees e on e.id = n.recipient_id
      where e.employee_no = 'E2E-FA-A' and n.kind = 'lead_first_contact' and n.created_at >= '${since}'`);
    expect(Number(perKind)).toBeLessThanOrEqual(1);
    const task = sql(`select id from public.tasks where type = 'lead_first_contact' and status = 'open'
      and owner_id = '${empId("E2E-FA-A")}' order by created_at desc limit 1`);
    await refused(rpc(ali(), "rpc_set_task_status", { p_task_id: task, p_status: "done" }), "system_task_auto");
  });
});

test.describe("Runde 2", () => {
  test("P4-R2-06 parallele Anlage mit gleicher Telefonnummer ergibt einen Lead", async () => {
    const ph = phone(7);
    const name = `Qx${Math.random().toString(36).slice(2, 10)}`;
    const results = await Promise.allSettled([0, 1].map(() =>
      rpc(ali(), "rpc_create_lead", { p_data: { last_name: name, phone: ph, source_id: sourceId("Website") } })));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(sql(`select count(*) from public.leads where phone = '${ph}'`)).toBe("1");
  });

  test("P4-R2-01 + P4-R2-02 Doppelklick legt einen Lead an; Aktivität aktualisiert die Phase ohne Neuladen", async ({ page }) => {
    const name = `Doppel ${RUN}`;
    await loginAs(page, "fa.a@test.com");
    await page.goto("/vertrieb/leads");
    await page.getByRole("button", { name: "Lead anlegen" }).click();
    await page.getByLabel("Nachname").fill(name);
    await page.getByRole("dialog").getByRole("button", { name: "Lead anlegen" }).dblclick();
    await expect(page).toHaveURL(/\/vertrieb\/leads\/[0-9a-f-]{36}$/);
    expect(sql(`select count(*) from public.leads where last_name = '${name}'`)).toBe("1");
    await page.getByRole("button", { name: "Erfassen" }).dblclick();
    await expect(page.locator("ol[aria-label=Phase] [aria-current=step]")).toHaveText("Kontaktversuch");
    expect(sql(`select count(*) from public.activities a join public.leads l on l.id = a.linked_id where l.last_name = '${name}'`)).toBe("1");
  });
});

test.describe("Oberfläche", () => {
  test("P4-UI-02 Suche findet die Telefonnummer in deutscher Schreibweise", async ({ page }) => {
    await loginAs(page, "fa.a@test.com");
    await page.goto("/vertrieb/leads");
    const national = `0${lenaPhone.slice(3, 6)} ${lenaPhone.slice(6)}`;
    await page.getByRole("searchbox").fill(national);
    await expect(page.getByText(`Lead ${RUN}`).first()).toBeVisible();
  });

  test("P4-UI-03 + P4-UX-11 Details ohne Rohcodes, übersprungene Phasen erkennbar", async ({ page }) => {
    await loginAs(page, "fa.a@test.com");
    await page.goto(`/vertrieb/leads/${lenaId}`);
    await expect(page.getByText("Lebensversicherung")).toBeVisible();
    await expect(page.locator("dd", { hasText: /^hoch$/ })).toBeVisible();
    await expect(page.getByText(/\+49 176 /)).toBeVisible();
    await expect(page.locator("ol[aria-label=Phase] li[data-state=skipped]").first()).toBeVisible();
  });

  test("P4-BUG-01 Uhrzeitfelder lassen nur gültige Zeiten zu", async ({ page }) => {
    await loginAs(page, "fa.a@test.com");
    await page.goto(`/vertrieb/leads/${lenaId}`);
    await expect(page.locator("input[type=time]").first()).toBeVisible();
    await expect(page.locator("input[placeholder='14:30']")).toHaveCount(0);
  });

  test("P4-UX-07 gespeicherte Stummschaltungen sind beim Öffnen angehakt", async ({ page }) => {
    await rpc(apiSession("fb.b@test.com"), "rpc_set_muted_notifications", { p_kinds: ["lead_first_contact"] });
    await loginAs(page, "fb.b@test.com");
    await page.goto("/vertrieb/aufgaben");
    await page.getByRole("button", { name: /^Benachrichtigungen/ }).click();
    await page.getByRole("button", { name: "Benachrichtigungs-Einstellungen" }).click();
    await expect(page.getByRole("checkbox", { name: "Lead-Erstkontakt" })).toBeChecked();
  });

  test("P4-PERF-01 viele erledigte Aufgaben verdrängen keine offenen", async ({ page }) => {
    const ben = empId("E2E-FB-B");
    sql(`insert into public.tasks (owner_id, title, status, completed_at)
         select '${ben}', 'Alt ${RUN} ' || g, 'done', now() from generate_series(1, 600) g`);
    sql(`insert into public.tasks (owner_id, title, due_at) values ('${ben}', 'Offen ${RUN}', now() + interval '2 days')`);
    await loginAs(page, "fb.b@test.com");
    await page.goto("/vertrieb/aufgaben");
    await expect(page.getByText(`Offen ${RUN}`)).toBeVisible();
  });

  test("P4-UI-06 Suchfeld behält auf schmalen Bildschirmen seine Höhe", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAs(page, "fa.a@test.com");
    await page.goto("/vertrieb/leads");
    const box = await page.getByRole("searchbox").boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(36);
  });

  test("P4-UX-04 Admins öffnen die Auswertung in der Gesamtansicht", async ({ page }) => {
    await loginAs(page, "admin@test.com");
    await page.goto("/vertrieb/leads/analyse");
    await expect(page.getByRole("tab", { name: "Gesamt" })).toHaveAttribute("aria-selected", "true");
  });

  test("P4-BUG-02 Kosten mit Komma werden gespeichert", async ({ page }) => {
    await loginAs(page, "admin@test.com", { aal2: true });
    await page.goto("/admin/leads");
    const costs = page.locator("section", { has: page.getByRole("heading", { name: "Quellen und Kosten" }) });
    await costs.getByLabel("Betrag").fill("123,45");
    await costs.getByRole("button", { name: "Speichern" }).click();
    await expect(page.getByText("Kosten gespeichert")).toBeVisible();
    expect(sql("select count(*) from public.lead_source_costs where amount = 123.45")).not.toBe("0");
  });
});
