import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Nonce-based Content-Security-Policy.
 *
 * The CSP used to live in next.config.ts with `script-src 'unsafe-inline'`,
 * because Next injects inline bootstrap scripts and a static header cannot
 * know about them. That made the CSP useless against XSS: any injected
 * <script> ran just like Next's own.
 *
 * Now every document request gets a fresh, unguessable nonce. Next reads it
 * from the request's CSP header during rendering and stamps it onto its own
 * scripts; our one inline script (the theme bootstrap in app/layout.tsx) reads
 * it from `x-nonce`. 'strict-dynamic' then lets those trusted scripts load the
 * rest of the bundle, while any script without the nonce is refused.
 *
 * Cost: a nonce is per request, so pages can no longer be prerendered as
 * static HTML — the root layout reads headers(), which makes every route
 * dynamic. The service worker caches whole Responses (headers included), so
 * an offline copy keeps the CSP that matches its own nonce.
 */

const isDev = process.env.NODE_ENV === "development";

// Supabase origin comes from env so the CSP follows the active project —
// local dev runs Supabase on http://127.0.0.1:54321, production on
// *.supabase.co. Hardcoding one would block the other ("Failed to fetch").
const SUPABASE_ORIGIN = new URL(
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
    "https://mitvsxswoagzixcbrhia.supabase.co",
).origin;
const SUPABASE_WS = SUPABASE_ORIGIN.replace(/^http/, "ws");

function buildCsp(nonce: string): string {
  return [
    "default-src 'self'",
    // Gemini is called from the Edge Function (server side, where CSP does not
    // apply), never from the browser — verified: no client module imports
    // @google/generative-ai or references generativelanguage.googleapis.com.
    // Leaving that host in connect-src only widened where a hypothetical
    // injected script could exfiltrate to.
    `connect-src 'self' ${SUPABASE_ORIGIN} ${SUPABASE_WS}`,
    `img-src 'self' data: blob: ${SUPABASE_ORIGIN}`,
    // 'unsafe-eval' is DEV ONLY: React dev tooling (callstack reconstruction,
    // Turbopack HMR) uses eval; production builds never do. 'self' is only a
    // fallback for browsers without 'strict-dynamic' support.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    // Styles keep 'unsafe-inline': React `style={...}` props, Recharts and the
    // cookie banner all set inline style attributes, which a nonce cannot
    // cover. Injected CSS cannot execute code, so this is the accepted
    // trade-off; scripts are where the nonce matters.
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    // No <iframe>/<embed>/<object> anywhere in the app, so deny framing
    // outright rather than letting it fall through to default-src.
    "frame-src 'none'",
    // Production only. Local development points NEXT_PUBLIC_SUPABASE_URL at
    // http://127.0.0.1:54321, and this directive rewrites http:// subresource
    // requests to https://, which would break every Supabase call on a dev
    // machine.
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildCsp(nonce);

  // Next extracts the nonce from the *request* CSP header while rendering.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    // Documents only: skip build assets, image optimisation and any file with
    // an extension in public/ (sw.js, manifest, icons, pdf.worker.min.mjs).
    // Prefetches are skipped too — they fetch RSC payloads, not HTML.
    {
      source: "/((?!_next/static|_next/image|.*\\..*).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
