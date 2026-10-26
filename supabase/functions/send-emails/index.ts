// ============================================================
// send-emails — delivers queued customer emails (§10.2, §14.6)
// ============================================================
// Triggered by a scheduler (Supabase scheduled function or pg_net cron) with
// the header `x-cron-secret: <EMAIL_CRON_SECRET>`. Not callable from browsers.
//
// All decisions stay in the database: rpc_claim_email_sends() only releases
// rows that pass the kill switch, send window, daily limit, consent, legal
// basis, suppression list and merge-field checks AT THIS MOMENT, already
// rendered. This function only hands them to the provider and reports back.
//
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, EMAIL_CRON_SECRET,
// EMAIL_PROVIDER (OD-11; "dryrun" for staging), EMAIL_FROM.
// Without a provider the function exits before claiming anything, so queued
// mail simply waits (and expires after its occasion day).
// ============================================================
import { createClient } from "jsr:@supabase/supabase-js@2";
import { providerFromEnv } from "./provider.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const CRON_SECRET = Deno.env.get("EMAIL_CRON_SECRET") ?? "";
const FROM = Deno.env.get("EMAIL_FROM") ?? "";
const BATCH = 50;

const service = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** Constant-time comparison so the secret can't be guessed byte by byte. */
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

type Claimed = { id: string; idempotency_key: string; to: string; subject: string; text: string; html: string };

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  if (!CRON_SECRET || !safeEqual(req.headers.get("x-cron-secret") ?? "", CRON_SECRET)) {
    return json(401, { error: "unauthorized" });
  }
  const provider = providerFromEnv(Deno.env.get("EMAIL_PROVIDER"));
  if (!provider || !FROM) return json(503, { error: "no_provider" }); // OD-11

  const { data, error } = await service.rpc("rpc_claim_email_sends", { p_limit: BATCH });
  if (error) return json(500, { error: "claim_failed" });

  let sent = 0;
  let failed = 0;
  for (const mail of (data ?? []) as Claimed[]) {
    try {
      const { messageId } = await provider.send(
        { id: mail.id, idempotencyKey: mail.idempotency_key, to: mail.to, subject: mail.subject, text: mail.text, html: mail.html },
        FROM,
      );
      await service.rpc("rpc_report_email_result", { p_id: mail.id, p_ok: true, p_provider_message_id: messageId });
      sent++;
    } catch (e) {
      // Only an error class goes to the log, never the message content.
      const code = e instanceof Error ? e.name : "error";
      await service.rpc("rpc_report_email_result", { p_id: mail.id, p_ok: false, p_error: `${provider.name}:${code}` });
      failed++;
    }
  }
  return json(200, { sent, failed });
});
