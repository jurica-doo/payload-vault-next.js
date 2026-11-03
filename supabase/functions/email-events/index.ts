// ============================================================
// email-events — provider webhooks: delivered / bounced / complaint
// ============================================================
// POST { "message_id": "...", "event": "delivered" | "bounced" | "complaint" }
// with header `x-webhook-secret: <EMAIL_WEBHOOK_SECRET>`. Providers usually
// sign their webhooks; once the provider is chosen (OD-11), verify its
// signature here instead of (or in addition to) the shared secret.
// Bounces and complaints add the address to the suppression list in the DB.
// ============================================================
import { createClient } from "jsr:@supabase/supabase-js@2";

const service = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", {
  auth: { persistSession: false, autoRefreshToken: false },
});
const SECRET = Deno.env.get("EMAIL_WEBHOOK_SECRET") ?? "";
const EVENTS = new Set(["delivered", "bounced", "complaint"]);

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
  if (!SECRET || !safeEqual(req.headers.get("x-webhook-secret") ?? "", SECRET)) return json(401, { error: "unauthorized" });
  if (Number(req.headers.get("content-length") ?? "0") > MAX_BYTES) return json(413, { error: "too_large" });

  // The header can be missing or wrong (chunked upload): stop reading at the cap (P6-09).
  const raw = await readCapped(req, MAX_BYTES);
  if (raw === null) return json(413, { error: "too_large" });
  let body: { message_id?: unknown; event?: unknown };
  try {
    body = JSON.parse(raw);
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
