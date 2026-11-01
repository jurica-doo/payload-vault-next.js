// Thin client for the local Supabase API: the same endpoints the app uses
// (GoTrue + PostgREST), so filling data exercises the real permission checks.
import { supabaseEnv } from "./env.mts";
import { freshTotp } from "./totp.mts";

export const PASSWORD = "123456";

/** `raw` is GoTrue's full token response — what supabase-js keeps in localStorage. */
export type Session = { email: string; userId: string; accessToken: string; aal: "aal1" | "aal2"; raw: Record<string, unknown> };

// Plain fields (not parameter properties): Node runs these files with
// type stripping only.
export class ApiError extends Error {
  readonly status: number;
  readonly code: string | undefined;
  constructor(status: number, code: string | undefined, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function request<T>(path: string, init: RequestInit & { token?: string; service?: boolean }): Promise<T> {
  const { apiUrl, anonKey, serviceRoleKey } = supabaseEnv();
  const key = init.service ? serviceRoleKey : anonKey;
  const res = await fetch(`${apiUrl}${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${init.token ?? key}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const message = body?.message ?? body?.msg ?? body?.error_description ?? body?.error ?? text;
    throw new ApiError(res.status, body?.code ?? body?.error_code, `${path}: ${message}`);
  }
  return body as T;
}

function decodeAal(token: string): "aal1" | "aal2" {
  const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
  return payload.aal === "aal2" ? "aal2" : "aal1";
}

export async function signIn(email: string, password = PASSWORD): Promise<Session> {
  const body = await request<{ access_token: string; user: { id: string } }>("/auth/v1/token?grant_type=password", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  return { email, userId: body.user.id, accessToken: body.access_token, aal: decodeAal(body.access_token), raw: body };
}

/** Enrolls and verifies a TOTP factor; returns the secret and an aal2 session. */
export async function enrollTotp(session: Session): Promise<{ secret: string; factorId: string; session: Session }> {
  const enrolled = await request<{ id: string; totp: { secret: string } }>("/auth/v1/factors", {
    method: "POST",
    token: session.accessToken,
    body: JSON.stringify({ factor_type: "totp", friendly_name: "e2e" }),
  });
  const upgraded = await verifyTotp(session, enrolled.id, enrolled.totp.secret);
  return { secret: enrolled.totp.secret, factorId: enrolled.id, session: upgraded };
}

/** Steps an existing session up to aal2 with the current TOTP code. */
export async function verifyTotp(session: Session, factorId: string, secret: string): Promise<Session> {
  const challenge = await request<{ id: string }>(`/auth/v1/factors/${factorId}/challenge`, {
    method: "POST",
    token: session.accessToken,
    body: "{}",
  });
  const verified = await request<{ access_token: string }>(`/auth/v1/factors/${factorId}/verify`, {
    method: "POST",
    token: session.accessToken,
    body: JSON.stringify({ challenge_id: challenge.id, code: await freshTotp(secret) }),
  });
  return { ...session, accessToken: verified.access_token, aal: decodeAal(verified.access_token), raw: verified };
}

export async function rpc<T = unknown>(session: Session, fn: string, args: Record<string, unknown> = {}): Promise<T> {
  return request<T>(`/rest/v1/rpc/${fn}`, { method: "POST", token: session.accessToken, body: JSON.stringify(args) });
}

export async function select<T = unknown>(session: Session, pathAndQuery: string): Promise<T> {
  return request<T>(`/rest/v1/${pathAndQuery}`, { method: "GET", token: session.accessToken });
}

/** Direct table write, bypassing the RPCs — used to prove it is refused. */
export async function insertRow(session: Session, table: string, row: Record<string, unknown>): Promise<unknown> {
  return request(`/rest/v1/${table}`, { method: "POST", token: session.accessToken, body: JSON.stringify(row) });
}

/** Public self-signup (what /signup does). */
export async function signUp(email: string, password: string): Promise<unknown> {
  return request("/auth/v1/signup", { method: "POST", body: JSON.stringify({ email, password }) });
}

/** Admin (or any TOTP account from the e2e state) at aal2, via the API. */
export async function signInAal2(email: string, totpEntry: { secret: string; factorId: string }): Promise<Session> {
  return verifyTotp(await signIn(email), totpEntry.factorId, totpEntry.secret);
}

/**
 * Creates a login for an already invited email (stands in for clicking the
 * invite link). GoTrue enforces its 8-character minimum here, so the account
 * gets a strong temporary password; the fill script then sets the shared
 * test password `123456` directly (GoTrue checks length only when setting a
 * password, not at login).
 */
export async function adminCreateUser(email: string): Promise<string> {
  const body = await request<{ id: string }>("/auth/v1/admin/users", {
    method: "POST",
    service: true,
    body: JSON.stringify({ email, password: `Tmp-${crypto.randomUUID()}` }),
  });
  return body.id;
}

/** Confirms the email like the invite link does (fires the activation trigger). */
export async function adminConfirmEmail(userId: string): Promise<void> {
  await request(`/auth/v1/admin/users/${userId}`, {
    method: "PUT",
    service: true,
    body: JSON.stringify({ email_confirm: true }),
  });
}
