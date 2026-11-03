// Phase 5 · customers, consents, contracts, service items, privacy — regression tests for the
// review findings (requirements1/phase-5-crm/verification/r1-p5-verification.md). Every test title
// starts with its finding ID. The file creates its own customers through the real API (unique names
// per run) and doesn't touch data other files assert on.
import { expect, test } from "@playwright/test";
import { ApiError, rpc } from "../lib/api.mts";
import { sql } from "../lib/db.mts";
import { loginAs } from "./helpers";
import { apiSession } from "./sessions";

const RUN = Date.now().toString(36);
const PH = String(Date.now() % 1_000_000).padStart(6, "0");
const ali = () => apiSession("fa.a@test.com");
const comp2 = () => apiSession("compliance@test.com", true);

async function refused(promise: Promise<unknown>, key: string) {
  const error = await promise.then(() => null, (e: unknown) => e);
  expect(error, `expected "${key}"`).toBeInstanceOf(ApiError);
  expect((error as ApiError).message).toContain(key);
}

let karla = "";

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  karla = await rpc<string>(ali(), "rpc_create_customer", {
    p_data: { first_name: "Karla", last_name: `Kunde ${RUN}`, phone: `+49173${PH}1`, city: "München", postal_code: "80331" },
    p_confirm_duplicates: true,
  });
  await rpc(ali(), "rpc_save_contract_link", { p_id: null, p_customer_id: karla, p_data: { external_contract_id: `LV-${RUN}`, category_code: "LV", status: "active" } });
});

test.describe("Datenbank-Regeln", () => {
  test("P5-API-01/02 benannte Fehlerschlüssel statt roher Datenbankfehler", async () => {
    await refused(rpc(ali(), "rpc_update_customer", { p_customer_id: karla, p_data: { notes: "x".repeat(4001) } }), "text_too_long");
    await refused(rpc(ali(), "rpc_record_consent", { p_customer_id: karla, p_purpose: "fax", p_action: "granted", p_legal_basis: "contract", p_source: "form" }), "consent_invalid");
    await refused(rpc(ali(), "rpc_save_contract_link", { p_id: null, p_customer_id: karla, p_data: { external_contract_id: `E-${RUN}`, start_date: "2026-05-01", end_date: "2020-01-01" }, p_dates_confirmed: true }), "contract_dates_order");
    await refused(rpc(ali(), "rpc_save_service_item", { p_id: null, p_customer_id: karla, p_kind: "contract_renewal", p_title: "Hauptfälligkeit", p_due_on: null }), "renewal_date_unconfirmed");
  });

  test("P5-UX-05 Nachfassen in der Vergangenheit wird abgelehnt", async () => {
    await refused(rpc(ali(), "rpc_update_customer", { p_customer_id: karla, p_data: { next_follow_up_at: new Date(Date.now() - 86_400_000).toISOString() } }), "date_in_past");
  });

  test("P5-UX-06 manuell verknüpfte Verträge bleiben „aus Unterlagen“", async () => {
    await refused(rpc(ali(), "rpc_save_contract_link", { p_id: null, p_customer_id: karla, p_data: { source_system: "portal", external_contract_id: `P-${RUN}` } }), "manual_source_only");
  });

  test("P5-PRIV-01 Datenschutz setzt einen Widerspruch in einem Schritt um", async () => {
    const request = await rpc<string>(comp2(), "rpc_open_privacy_request", { p_kind: "objection", p_subject_type: "customer", p_subject_id: karla, p_received_via: "letter" });
    await rpc(comp2(), "rpc_apply_objection", { p_request_id: request });
    const check = await rpc<{ reason: string }>(ali(), "rpc_may_contact", { p_customer_id: karla, p_purpose: "contact_phone" });
    expect(check.reason).toBe("opt_out");
    expect(sql(`select status from public.privacy_requests where id = '${request}'`)).toBe("completed");
    await refused(rpc(comp2(), "rpc_record_consent", { p_customer_id: karla, p_purpose: "marketing_email", p_action: "granted", p_legal_basis: "consent", p_source: "form", p_evidence: "Formular" }), "forbidden");
  });
});

test.describe("Oberfläche", () => {
  test("P5-UI-01 Suche findet die Telefonnummer in deutscher Schreibweise", async ({ page }) => {
    await loginAs(page, "fa.a@test.com");
    await page.goto("/vertrieb/kunden");
    await page.getByRole("searchbox").fill(`0173 ${PH}1`);
    await expect(page.getByText(`Karla Kunde ${RUN}`).first()).toBeVisible();
  });

  test("P5-UI-02 + P5-REG-01 Details ohne Rohcodes, Uhrzeit als Zeitauswahl", async ({ page }) => {
    await loginAs(page, "fa.a@test.com");
    await page.goto(`/vertrieb/kunden/${karla}`);
    await expect(page.getByText("Lebensversicherung")).toBeVisible();
    await expect(page.getByText(/aus Unterlagen/).first()).toBeVisible();
    await expect(page.getByText(/\+49 173 /)).toBeVisible();
    const followUp = page.locator("section", { has: page.getByRole("heading", { name: "Nächstes Nachfassen" }) });
    await expect(followUp.locator("input[type=time]")).toBeVisible();
  });

  test("P5-UX-01 Widerspruch wird in einem Dialog bestätigt", async ({ page }) => {
    const other = await rpc<string>(ali(), "rpc_create_customer", { p_data: { last_name: `Dialog ${RUN}` }, p_confirm_duplicates: true });
    await loginAs(page, "fa.a@test.com");
    await page.goto(`/vertrieb/kunden/${other}`);
    await page.getByRole("button", { name: /Widerspruch: keine Kontaktaufnahme/ }).click();
    await expect(page.getByRole("dialog", { name: "Widerspruch gegen jede Kontaktaufnahme" })).toBeVisible();
    await page.getByRole("button", { name: "Abbrechen" }).click();
    expect(sql(`select count(*) from public.customer_consents where customer_id = '${other}'`)).toBe("0");
  });

  test("P5-UX-02 Datenschutzanfragen nennen die Kundennummer", async ({ page }) => {
    const request = await rpc<string>(comp2(), "rpc_open_privacy_request", { p_kind: "access", p_subject_type: "customer", p_subject_id: karla, p_received_via: "email" });
    const no = sql(`select 'DS-' || request_no || ' · Auskunft' from public.privacy_requests where id = '${request}'`);
    const kNo = sql(`select 'K-' || lpad(customer_no::text, 5, '0') from public.customers where id = '${karla}'`);
    await loginAs(page, "compliance@test.com", { aal2: true });
    await page.goto("/vertrieb/kunden/datenschutz");
    await expect(page.locator("li", { hasText: no }).getByText(new RegExp(kNo))).toBeVisible();
  });
});
