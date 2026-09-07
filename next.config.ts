import type { NextConfig } from "next";

/**
 * Stable per-deploy build id, stamped into the service-worker URL
 * (`/sw.js?v=<id>`) so every deploy registers as a NEW service worker and the
 * in-app update banner can fire. Falls back to a timestamp for local builds.
 */
const BUILD_ID =
  process.env.BUILD_ID ??
  process.env.VERCEL_GIT_COMMIT_SHA ??
  process.env.CF_PAGES_COMMIT_SHA ??
  Date.now().toString(36);

// Ported from the old Netlify `public/_headers` (which Next.js does not read).
// script-src needs 'unsafe-inline' because Next injects inline bootstrap
// scripts; tightening to a nonce-based CSP is a possible follow-up.
// 'unsafe-eval' is DEV ONLY: React dev tooling (callstack reconstruction,
// Turbopack HMR) uses eval; production builds never do.
const isDev = process.env.NODE_ENV === "development";

// Supabase origin comes from env so the CSP follows the active project —
// local dev runs Supabase on http://127.0.0.1:54321, production on
// *.supabase.co. Hardcoding one would block the other ("Failed to fetch").
const SUPABASE_ORIGIN = new URL(
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
    "https://mitvsxswoagzixcbrhia.supabase.co",
).origin;
const SUPABASE_WS = SUPABASE_ORIGIN.replace(/^http/, "ws");

const CSP = [
  "default-src 'self'",
  // Gemini is called from the Edge Function (server side, where CSP does not
  // apply), never from the browser — verified: no client module imports
  // @google/generative-ai or references generativelanguage.googleapis.com.
  // Leaving that host in connect-src only widened where a hypothetical
  // injected script could exfiltrate to.
  `connect-src 'self' ${SUPABASE_ORIGIN} ${SUPABASE_WS}`,
  `img-src 'self' data: blob: ${SUPABASE_ORIGIN}`,
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} blob:`,
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  // No <iframe>/<embed>/<object> anywhere in the app, so deny framing outright
  // rather than letting it fall through to default-src.
  "frame-src 'none'",
  // Production only. Local development points NEXT_PUBLIC_SUPABASE_URL at
  // http://127.0.0.1:54321, and this directive rewrites http:// subresource
  // requests to https://, which would break every Supabase call on a dev
  // machine. In production every origin we talk to is already https, so it
  // costs nothing and closes the gap if an http:// URL ever creeps in.
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  // HSTS: the app is a PWA handling financial documents and is served over
  // HTTPS in production, so pin browsers to it and remove the first-request
  // downgrade window. Two years + includeSubDomains is the preload-eligible
  // setting; `preload` itself is intentionally NOT sent, because submitting to
  // the preload list is a one-way door for the apex domain and its subdomains
  // and must be a deliberate decision by the domain owner, not a side effect
  // of a header change. Emitted only outside development so local http://
  // origins are not pinned on the developer's machine.
  ...(isDev
    ? []
    : [
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains",
        },
      ]),
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
  { key: "Content-Security-Policy", value: CSP },
];

const nextConfig: NextConfig = {
  generateBuildId: async () => BUILD_ID,
  env: {
    NEXT_PUBLIC_SW_VERSION: BUILD_ID,
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        source: "/manifest.webmanifest",
        headers: [
          { key: "Content-Type", value: "application/manifest+json" },
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
        ],
      },
    ];
  },
};

export default nextConfig;
