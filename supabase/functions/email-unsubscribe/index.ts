// ============================================================
// email-unsubscribe — the unsubscribe link in client e-mails
// ============================================================
// Public (no login): the link carries a random per-customer token and the
// consent purpose of the mail (t, z). Two callers:
//
//   * the app page /abmelden (button "Abmelden bestätigen"): POST JSON
//     { "t": "<uuid>", "z": "birthday_email" } — CORS for APP_ORIGIN;
//   * mail clients, RFC 8058 one-click (List-Unsubscribe-Post): POST to
//     ?t=…&z=… with the body "List-Unsubscribe=One-Click".
//
// A GET never changes anything (link scanners prefetch links). The database
// records a withdrawal for that purpose (rpc_unsubscribe_email, service role
// only); it is idempotent. Rate limited per IP; nothing personal is logged.
//
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, APP_ORIGIN.
// ============================================================
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const allowedOrigins = new Set((Deno.env.get("APP_ORIGIN") ?? "").split(",").map((s) => s.trim()).filter(Boolean));
const RATE_LIMIT = 30;
const WINDOW_SECONDS = 3600;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PURPOSES = new Set(["birthday_email", "holiday_email", "marketing_email", "contact_email"]);

const service = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

function cors(req: Request) {
  const origin = req.headers.get("Origin") ?? "";
  return {
    "Access-Control-Allow-Origin": allowedOrigins.has(origin) ? origin : "",
    "Vary": "Origin",
    "Access-Control-Allow-Headers": "apikey, content-type, x-client-info, authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}
const json = (req: Request, status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors(req), "Content-Type": "application/json", "Cache-Control": "no-store" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(req) });
  if (req.method !== "POST") return json(req, 405, { error: "method_not_allowed" });

  // Parameters from the query (one-click) or a small JSON body (app page).
  const url = new URL(req.url);
  let t = url.searchParams.get("t") ?? "";
  let z = url.searchParams.get("z") ?? "";
  const type = req.headers.get("content-type") ?? "";
  const raw = (await req.text()).slice(0, 2048);
  if (type.includes("application/json") && raw) {
    try {
      const body = JSON.parse(raw) as { t?: unknown; z?: unknown };
      if (typeof body.t === "string") t = body.t;
      if (typeof body.z === "string") z = body.z;
    } catch {
      return json(req, 400, { error: "invalid_body", code: "invalid_body" });
    }
  }
  if (!UUID.test(t) || !PURPOSES.has(z)) return json(req, 400, { error: "invalid_link", code: "invalid_link" });

  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  const { data: allowed, error: rateError } = await service.rpc("consume_rate_limit", {
    p_key: `email-unsubscribe:${ip}`,
    p_limit: RATE_LIMIT,
    p_window_seconds: WINDOW_SECONDS,
  });
  if (rateError) return json(req, 503, { error: "unavailable", code: "unavailable" });
  if (allowed === false) return json(req, 429, { error: "rate_limited", code: "rate_limited" });

  const { data, error } = await service.rpc("rpc_unsubscribe_email", { p_token: t, p_purpose: z });
  if (error) {
    console.error("unsubscribe_failed", error.code);
    return json(req, 500, { error: "processing_failed", code: "processing_failed" });
  }
  const result = data as { ok: boolean; error?: string; purpose?: string };
  if (!result.ok) return json(req, 404, { error: result.error ?? "invalid_link", code: result.error ?? "invalid_link" });
  return json(req, 200, { ok: true, purpose: result.purpose });
});
