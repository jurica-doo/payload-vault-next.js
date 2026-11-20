// ============================================================
// email-events — provider webhooks: delivered / bounced / complaint
// ============================================================
// Two ways in:
//   * Resend webhooks (OD-11), signed with Svix: headers svix-id,
//     svix-timestamp, svix-signature; secret RESEND_WEBHOOK_SECRET ("whsec_…"
//     from the Resend dashboard). Events email.delivered / email.bounced /
//     email.complained; everything else is acknowledged and ignored.
//   * Manual / dry-run: POST { "message_id", "event": "delivered" | "bounced" |
//     "complaint" } with header `x-webhook-secret: <EMAIL_WEBHOOK_SECRET>`.
// Bounces and complaints add the address to the suppression list in the DB.
// ============================================================
import { createClient } from "jsr:@supabase/supabase-js@2";

const service = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", {
  auth: { persistSession: false, autoRefreshToken: false },
});
const SECRET = Deno.env.get("EMAIL_WEBHOOK_SECRET") ?? "";
const RESEND_SECRET = Deno.env.get("RESEND_WEBHOOK_SECRET") ?? "";
const EVENTS = new Set(["delivered", "bounced", "complaint"]);
const RESEND_EVENTS: Record<string, string> = { "email.delivered": "delivered", "email.bounced": "bounced", "email.complained": "complaint" };
const TOLERANCE_SECONDS = 300;

/** Svix signature check (as used by Resend): HMAC-SHA256 over "id.timestamp.body". */
async function svixValid(req: Request, raw: string): Promise<boolean> {
  const id = req.headers.get("svix-id") ?? "";
  const ts = req.headers.get("svix-timestamp") ?? "";
  const sigs = req.headers.get("svix-signature") ?? "";
  if (!RESEND_SECRET || !id || !ts || !sigs) return false;
  const now = Math.floor(Date.now() / 1000);
  if (!/^\d+$/.test(ts) || Math.abs(now - Number(ts)) > TOLERANCE_SECONDS) return false;
  const secret = Uint8Array.from(atob(RESEND_SECRET.replace(/^whsec_/, "")), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("raw", secret, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${ts}.${raw}`)));
  const expected = btoa(String.fromCharCode(...mac));
  return sigs.split(" ").some((part) => {
    const [version, value] = part.split(",");
    return version === "v1" && value !== undefined && safeEqual(value, expected);
  });
}

function safeEqual(a: string, b: string) {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const MAX_BYTES = 10_000;

/** The request body as text, or null once it grows past `max` bytes. */
async function readCapped(req: Request, max: number): Promise<string | null> {
  if (!req.body) return "";
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    all.set(c, at);
    at += c.byteLength;
  }
  return new TextDecoder().decode(all);
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  const isResend = req.headers.has("svix-id");
  if (!isResend && (!SECRET || !safeEqual(req.headers.get("x-webhook-secret") ?? "", SECRET))) return json(401, { error: "unauthorized" });
  if (Number(req.headers.get("content-length") ?? "0") > MAX_BYTES) return json(413, { error: "too_large" });

  // The header can be missing or wrong (chunked upload): stop reading at the cap (P6-09).
  const raw = await readCapped(req, MAX_BYTES);
  if (raw === null) return json(413, { error: "too_large" });
  if (isResend && !(await svixValid(req, raw))) return json(401, { error: "unauthorized" });
  let body: { message_id?: unknown; event?: unknown };
  try {
    const parsed = JSON.parse(raw);
    if (isResend) {
      // Resend payload: { type: "email.bounced", data: { email_id: "…" } }
      const event = RESEND_EVENTS[String(parsed?.type ?? "")];
      if (!event) return json(200, { ok: true, ignored: true });
      body = { message_id: parsed?.data?.email_id, event };
    } else {
      body = parsed;
    }
  } catch {
    return json(400, { error: "invalid_json" });
  }
  if (!body || typeof body !== "object") return json(400, { error: "invalid_payload" });
  if (typeof body.message_id !== "string" || body.message_id.length > 200 || typeof body.event !== "string" || !EVENTS.has(body.event)) {
    return json(400, { error: "invalid_payload" });
  }
  const { error } = await service.rpc("rpc_record_email_event", { p_provider_message_id: body.message_id, p_event: body.event });
  // Unknown message ids are acknowledged so the provider stops retrying.
  if (error && error.code !== "P0002") return json(500, { error: "record_failed" });
  return json(200, { ok: true });
});
