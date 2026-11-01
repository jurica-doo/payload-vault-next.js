// Phase 1 · audit + identity/roles (r1-p1-audit.md, r1-p1-identity-roles.md)
import { expect, test } from "@playwright/test";
import {
  adminConfirmEmail,
  adminCreateUser,
  ApiError,
  insertRow,
  rpc,
  select,
  signIn,
  signUp,
} from "../lib/api.mts";
import { sql } from "../lib/db.mts";
import { readState } from "../lib/state.mts";
import { login, loginAs, sidebarLabels, stepUp } from "./helpers";
import { apiSession } from "./sessions";

const VAULT = ["Übersicht", "Einnahmen", "Steuerrelevante Ausgaben", "Statistiken", "Analysen"];
const LEGAL = ["Impressum", "Datenschutzerklärung"];
const nav = async (page: Parameters<typeof sidebarLabels>[0]) =>
  (await sidebarLabels(page)).filter((l) => !LEGAL.includes(l));

async function expectApiError(promise: Promise<unknown>, key: string): Promise<void> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error, `expected the API to refuse with "${key}"`).toBeInstanceOf(ApiError);
  expect((error as ApiError).message).toContain(key);
}

const admin2 = async () => apiSession("admin@test.com", true);

// The only tests that use the real login form and 2FA page; all others get
// their session injected (loginAs) to stay fast.
test.describe("Anmeldung und 2FA über die Oberfläche", () => {
  test("ohne Anmeldung → Login mit Rücksprung; falsches Passwort; Anmeldung führt zurück", async ({ page }) => {
    await page.goto("/vertrieb/produktion");
    await expect(page).toHaveURL(/\/login\?from=%2Fvertrieb%2Fproduktion/);
    await page.getByLabel("E-Mail").fill("fa@test.com");
    await page.getByLabel("Passwort", { exact: true }).fill("falsch-123");
    await page.getByRole("button", { name: "Anmelden" }).click();
    await expect(page).toHaveURL(/\/login/);
    await page.getByLabel("Passwort", { exact: true }).fill("123456");
    await page.getByRole("button", { name: "Anmelden" }).click();
    await expect(page).toHaveURL(/\/vertrieb\/produktion$/);
  });

  test("2FA-Seite: falscher Code abgelehnt, richtiger Code bestätigt die Sitzung", async ({ page }) => {
    await login(page, "admin@test.com");
    await page.goto("/profil/sicherheit");
    const field = page.getByLabel("Code aus der Authenticator-App");
    await field.fill("12345");
    await field.press("Enter");
    await expect(page.getByText("Bitte den 6-stelligen Code aus der App eingeben.")).toBeVisible();
    await stepUp(page, "admin@test.com");
    await page.goto("/admin/mitarbeiter");
    await expect(page.getByRole("button", { name: "Mitarbeitende anlegen" })).toBeEnabled();
  });
});

test.describe("Navigation je Rolle", () => {
  test("Berater: Vertrieb ja, Team und Verwaltung nein", async ({ page }) => {
    await loginAs(page, "fa@test.com");
    await page.goto("/");
    const items = await nav(page);
    expect(items).toEqual(expect.arrayContaining([...VAULT, "Cockpit", "Produktion", "Karriere", "Ziele"]));
    expect(items).not.toContain("Team");
    expect(items).not.toContain("Mitarbeitende");
  });

  test("Führungskraft: zusätzlich Team", async ({ page }) => {
    await loginAs(page, "tl@test.com");
    await page.goto("/");
    const items = await nav(page);
    expect(items).toContain("Team");
    expect(items).not.toContain("Mitarbeitende");
  });

  test("Admin: Verwaltung mit allen Bereichen", async ({ page }) => {
    await loginAs(page, "admin@test.com");
    await page.goto("/");
    expect(await nav(page)).toEqual(
      expect.arrayContaining(["Verwaltung", "Mitarbeitende", "Hierarchie", "Regeln", "Beförderungen"]),
    );
  });

  test("Tresor-Konto ohne Mitarbeiterdatensatz: nur Mein Tresor", async ({ page }) => {
    await loginAs(page, "vault@test.com");
    await page.goto("/");
    expect(await nav(page)).toEqual(VAULT);
    await page.goto("/vertrieb");
    await expect(page.getByText("Dieser Bereich ist für Sie nicht freigeschaltet.")).toBeVisible();
  });

  test("Deaktivierte Person: nur noch der eigene Tresor", async ({ page }) => {
    await loginAs(page, "inactive@test.com");
    await page.goto("/");
    expect(await nav(page)).toEqual(VAULT);
    await page.goto("/vertrieb/produktion");
    await expect(page.getByText("Dieser Bereich ist für Sie nicht freigeschaltet.")).toBeVisible();
  });
});

test.describe("Mitarbeitende verwalten", () => {
  test("ohne 2FA-Bestätigung sind alle Aktionen gesperrt", async ({ page }) => {
    await loginAs(page, "admin@test.com");
    await page.goto("/admin/mitarbeiter");
    await expect(page.getByText("Zwei-Faktor-Anmeldung erforderlich.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Mitarbeitende anlegen" })).toBeDisabled();
  });

  test("mit 2FA: Status, Stufe und Rollen der Testdaten", async ({ page }) => {
    await loginAs(page, "admin@test.com", { aal2: true });
    await page.goto("/admin/mitarbeiter");
    await expect(page.getByText("Zwei-Faktor-Anmeldung erforderlich.")).toBeHidden();
    const row = (name: string) => page.getByRole("row").filter({ hasText: name });
    await expect(row("Wartend, Ida")).toContainText("Eingeladen");
    await expect(row("Inaktiv, Igor")).toContainText("Inaktiv");
    await expect(row("Ohnestufe, Nora")).toContainText("fehlt");
    await expect(row("Teamleiter, Tim")).toContainText("TL");
    await expect(row("Teamleiter, Tim")).toContainText("E2E-TL");
  });

  test("anlegen: Pflichtfelder, Telefon-Format, Dublette, Erfolg", async ({ page }) => {
    await loginAs(page, "admin@test.com", { aal2: true });
    await page.goto("/admin/mitarbeiter");
    await page.getByRole("button", { name: "Mitarbeitende anlegen" }).click();
    const dialog = page.getByRole("dialog", { name: "Mitarbeitende anlegen" });

    // Required fields are native `required` inputs: the browser blocks the submit.
    await dialog.getByRole("button", { name: "Anlegen & einladen" }).click();
    await expect(dialog).toBeVisible();
    expect(await dialog.getByLabel("Vorname").evaluate((el) => (el as HTMLInputElement).validity.valueMissing)).toBe(true);

    await dialog.getByLabel("Vorname").fill(" Nina ");
    await dialog.getByLabel("Nachname").fill("Neu");
    await dialog.getByLabel("E-Mail").fill(" Nina.Neu@Test.com ");
    await dialog.getByLabel("Startdatum").fill("2026-11-01");
    await dialog.getByLabel("Telefon").fill("abc"); // note: "0170 123" is valid (+49170123)
    await dialog.getByRole("button", { name: "Anlegen & einladen" }).click();
    await expect(dialog.getByText(/gültige Telefonnummer/)).toBeVisible();

    await dialog.getByLabel("Telefon").fill("0170 1234567");
    await dialog.getByRole("button", { name: "Anlegen & einladen" }).click();
    await expect(page.getByRole("row").filter({ hasText: "Neu, Nina" })).toContainText("Eingeladen");
    // Stored normalised: trimmed, lower-case e-mail, E.164 phone.
    expect(sql("select email || ' ' || phone from public.employees where last_name = 'Neu'")).toBe(
      "nina.neu@test.com +491701234567",
    );

    await page.getByRole("button", { name: "Mitarbeitende anlegen" }).click();
    await dialog.getByLabel("Vorname").fill("Nina");
    await dialog.getByLabel("Nachname").fill("Doppelt");
    await dialog.getByLabel("E-Mail").fill("NINA.NEU@test.com");
    await dialog.getByLabel("Startdatum").fill("2026-11-01");
    await dialog.getByRole("button", { name: "Anlegen & einladen" }).click();
    await expect(dialog.getByText(/bereits einen Mitarbeitenden/)).toBeVisible();
  });

  test("der letzte Admin kann sich die Rolle nicht entziehen", async ({ page }) => {
    await loginAs(page, "admin@test.com", { aal2: true });
    await page.goto("/admin/mitarbeiter");
    await page.getByRole("row").filter({ hasText: "Mustermann, Erika" }).getByTitle("Administration entziehen").click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("textbox").fill("Test: letzte Administration entfernen");
    await dialog.getByRole("button", { name: "Entziehen" }).click();
    await expect(dialog.getByText("Der letzte Administrator kann nicht entfernt werden.")).toBeVisible();
  });
});

test.describe("Sicherheit über die API", () => {
  test("Admin-RPC ohne 2FA → mfa_required, als Berater → forbidden", async () => {
    const args = { p_first_name: "X", p_last_name: "Y", p_email: "x.y@test.com", p_start_date: "2026-01-01" };
    await expectApiError(rpc(await signIn("admin@test.com"), "rpc_create_employee", args), "mfa_required");
    await expectApiError(rpc(await signIn("fa@test.com"), "rpc_create_employee", args), "forbidden");
  });

  test("direkte Schreibzugriffe auf Personaltabellen werden verweigert", async () => {
    const admin = await admin2();
    await expectApiError(
      insertRow(admin, "employees", { first_name: "D", last_name: "Irekt", email: "direkt@test.com", start_date: "2026-01-01" }),
      "permission denied",
    );
    await expectApiError(insertRow(admin, "user_roles", { user_id: admin.userId, role: "finance" }), "permission denied");
  });

  test("Sichtbarkeit: Berater sieht nur sich, Finanzen sieht alle", async () => {
    const own = await select<unknown[]>(await signIn("fa@test.com"), "employees?select=id");
    expect(own).toHaveLength(1);
    const all = await select<unknown[]>(await signIn("finance@test.com"), "employees?select=id");
    expect(all.length).toBeGreaterThan(10);
  });

  test("Audit-Verlauf: eigener ja, fremder forbidden", async () => {
    const state = readState();
    const fritz = await signIn("fa@test.com");
    const history = await rpc<unknown[]>(fritz, "rpc_audit_for", { p_entity_type: "public.employees", p_entity_id: state.employees["fa@test.com"] });
    expect(history.length).toBeGreaterThan(0);
    await expectApiError(
      rpc(fritz, "rpc_audit_for", { p_entity_type: "public.employees", p_entity_id: state.employees["tl@test.com"] }),
      "forbidden",
    );
  });

  test("Audit-Log ist unveränderlich, auch für postgres", async () => {
    expect(() => sql("update audit.events set reason = 'x' where id = (select max(id) from audit.events)")).toThrow(
      /audit_append_only/,
    );
  });
});

// Findings C1 and C3 from the Phase 1 review, fixed since.
test.describe("Deaktivierung und Registrierung", () => {
  test("C1: eine deaktivierte Admin-Person verliert ihre Admin-Rechte", async () => {
    const admin = await admin2();
    const created = await rpc<{ employee_id: string }>(admin, "rpc_create_employee", {
      p_first_name: "Ex",
      p_last_name: "Admin",
      p_email: "ex.admin@test.com",
      p_start_date: "2026-01-01",
    });
    const userId = await adminCreateUser("ex.admin@test.com");
    await adminConfirmEmail(userId);
    sql(`update auth.users set encrypted_password = extensions.crypt('123456', extensions.gen_salt('bf')) where id = '${userId}'`);
    await rpc(admin, "rpc_grant_role", { p_user_id: userId, p_role: "admin", p_reason: "Test: zweite Administration" });
    await rpc(admin, "rpc_set_employee_active", {
      p_employee_id: created.employee_id,
      p_active: false,
      p_reason: "Test: Vertrag beendet",
    });
    const exAdmin = await signIn("ex.admin@test.com");
    const context = await rpc<{ roles: string[] }>(exAdmin, "rpc_my_context");
    expect(context.roles).toEqual([]);
    await expectApiError(
      rpc(exAdmin, "rpc_create_employee", {
        p_first_name: "Nicht",
        p_last_name: "Erlaubt",
        p_email: "nicht.erlaubt@test.com",
        p_start_date: "2026-01-01",
      }),
      "forbidden",
    );
  });

  test("C3: Selbstregistrierung ist abgeschaltet und kann keine Einladung übernehmen", async () => {
    const admin = await admin2();
    await rpc(admin, "rpc_create_employee", {
      p_first_name: "Offen",
      p_last_name: "Einladung",
      p_email: "offen.einladung@test.com",
      p_start_date: "2026-01-01",
    });
    // Nobody sent the invite mail; a stranger tries to register the address.
    await expectApiError(signUp("offen.einladung@test.com", "Fremd-Passwort-1!"), "Signups not allowed");
  });
});
