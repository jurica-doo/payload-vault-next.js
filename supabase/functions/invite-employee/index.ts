// ============================================================
// invite-employee — sends the Supabase invite email for an employee
// ============================================================
// POST { "employee_id": "<uuid>" } with the admin's own JWT.
//
// All permission checks happen in the database: the function calls
// rpc_issue_invite AS THE CALLER (user-scoped client), so role admin + MFA
// (aal2) are enforced exactly like in the app. Only after the DB has issued
// a fresh invite row does the service role send the email; GoTrue then
// inserts the auth user, which passes the invite gate and gets linked to the
// employee by trigger (migration 20261026150000_identity_roles.sql).
//
// Secrets: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
// APP_ORIGIN (comma-separated; the first one is used for the redirect link).
// The redirect URL must be listed under Auth → URL Configuration.
// ============================================================
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const service = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const origins = (Deno.env.get("APP_ORIGIN") ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const allowedOrigins = new Set(origins);

// Invites land on the existing "set password" page; the invite link signs the
// user in, and that page sets the first password.
const REDIRECT_PATH = "/update-passwort";

// An admin inviting a whole team is fine; a stolen admin session spamming
// invite emails is not.
const RATE_LIMIT = 30;
const WINDOW_SECONDS = 3600;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function corsHeaders(req: Request) {
  const origin = req.headers.get("Origin") ?? "";
  return {
    "Access-Control-Allow-Origin": allowedOrigins.has(origin) ? origin : "",
    "Vary": "Origin",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function json(req: Request, status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
}

// Maps the DB's machine keys / SQLSTATE to HTTP statuses. The key itself is
// passed through so the app shows the same German text as for direct RPCs.
function statusForDbError(code: string | undefined): number {
  if (code === "42501") return 403;
  if (code === "P0002") return 404;
  if (code === "P0001") return 409;
  return 400;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, 405, { error: "method_not_allowed" });
  if (!origins.length) return json(req, 500, { error: "not_configured" });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json(req, 401, { error: "unauthorized" });

  const { data: { user }, error: authError } = await service.auth.getUser(authHeader.slice(7));
  if (authError || !user) return json(req, 401, { error: "unauthorized" });

  const { data: allowed, error: rateError } = await service.rpc("consume_rate_limit", {
    p_key: `invite-employee:${user.id}`,
    p_limit: RATE_LIMIT,
    p_window_seconds: WINDOW_SECONDS,
  });
  if (rateError) {
    console.error("Rate limit check failed:", rateError.message);
    return json(req, 503, { error: "unavailable" });
  }
  if (allowed !== true) return json(req, 429, { error: "rate_limited" });

  let employeeId: unknown;
  try {
    ({ employee_id: employeeId } = await req.json());
  } catch {
    return json(req, 400, { error: "invalid_body" });
  }
  if (typeof employeeId !== "string" || !UUID.test(employeeId)) {
    return json(req, 400, { error: "invalid_body" });
  }

  // Permission checks (admin + aal2) and invite bookkeeping happen in the DB,
  // under the caller's identity.
  const asCaller = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: issued, error: issueError } = await asCaller.rpc("rpc_issue_invite", {
    p_employee_id: employeeId,
  });
  if (issueError) {
    return json(req, statusForDbError(issueError.code), { error: issueError.message });
  }

  const email = (issued as { email?: string } | null)?.email;
  if (!email) return json(req, 500, { error: "unexpected" });

  const { error: sendError } = await service.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${origins[0]}${REDIRECT_PATH}`,
  });
  if (sendError) {
    // The invite row stays open, so the admin can simply retry.
    console.error("inviteUserByEmail failed:", sendError.message);
    const alreadyRegistered = /already (been )?registered|exists/i.test(sendError.message);
    return json(req, alreadyRegistered ? 409 : 502, {
      error: alreadyRegistered ? "user_exists" : "invite_send_failed",
    });
  }

  return json(req, 200, { ok: true });
});
