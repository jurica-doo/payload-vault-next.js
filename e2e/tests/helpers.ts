import { expect, type Page } from "@playwright/test";
import { PASSWORD } from "../lib/api.mts";
import { supabaseEnv } from "../lib/env.mts";
import { readState } from "../lib/state.mts";
import { freshTotp } from "../lib/totp.mts";
import { apiSession } from "./sessions";

/** supabase-js keeps the session under `sb-<first host label>-auth-token`. */
const storageKey = () => `sb-${new URL(supabaseEnv().apiUrl).hostname.split(".")[0]}-auth-token`;


/**
 * Test-browser setup that runs before any page script: the PWA install card
 * counts as dismissed and the cookie notice is hidden (never answered), so
 * neither covers the bottom of the page. Optionally places a session.
 */
async function prepare(page: Page, authKey?: string, authValue?: string): Promise<void> {
  await page.addInitScript(
    ([key, value]) => {
      try {
        localStorage.setItem("pwa-install-dismissed-at", String(Date.now()));
        if (key && value && !localStorage.getItem(key)) localStorage.setItem(key, value);
      } catch {
        /* storage blocked */
      }
      document.addEventListener("DOMContentLoaded", () => {
        const style = document.createElement("style");
        style.textContent = "#cc-main{display:none!important}";
        document.head.appendChild(style);
      });
    },
    [authKey ?? "", authValue ?? ""],
  );
}

/**
 * Signed in as `email` without the login form (session from the API).
 * `aal2: true` = 2FA already confirmed, for admin/finance writes.
 */
export async function loginAs(page: Page, email: string, opts: { aal2?: boolean } = {}): Promise<void> {
  const s = apiSession(email, opts.aal2 === true);
  await prepare(page, storageKey(), JSON.stringify(s.raw));
}

/** Signs in through the real login form (used by the login tests). */
export async function login(page: Page, email: string, password = PASSWORD): Promise<void> {
  await prepare(page);
  await page.goto("/login");
  await page.getByLabel("E-Mail").fill(email);
  await page.getByLabel("Passwort", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Anmelden" }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

/** Confirms the current session on the 2FA page with the account's TOTP code. */
export async function stepUp(page: Page, email: string): Promise<void> {
  const secret = readState().totp[email]?.secret;
  if (!secret) throw new Error(`no TOTP secret for ${email} — run npm run e2e:prepare`);
  await page.goto("/profil/sicherheit");
  const field = page.getByLabel("Code aus der Authenticator-App");
  await field.fill(await freshTotp(secret));
  await field.press("Enter");
  await expect(field).toBeHidden();
}

/** Chooses an option in a kit `Dropdown` / `EmployeePicker` by its label text. */
export async function pick(page: Page, label: string, option: string): Promise<void> {
  await page.getByLabel(label, { exact: true }).click();
  const list = page.getByRole("listbox");
  const search = list.getByPlaceholder("Suchen");
  if (await search.isVisible().catch(() => false)) await search.fill(option.split(",")[0]);
  await list.getByRole("option", { name: new RegExp(option.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) }).first().click();
}

/** Visible sidebar entries, in order. */
export async function sidebarLabels(page: Page): Promise<string[]> {
  const links = page.getByRole("navigation").first().getByRole("link");
  await expect(links.first()).toBeVisible();
  await page.waitForLoadState("networkidle"); // permissions (rpc_my_context) decide the sales groups
  return (await links.allInnerTexts()).map((t) => t.trim()).filter(Boolean);
}

/** German number as the app renders it, e.g. "10.5000" -> "10,50". */
export function de(value: string, decimals = 2): string {
  return new Intl.NumberFormat("de-DE", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(
    Number(value),
  );
}
