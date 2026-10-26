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
// The Content-Security-Policy is NOT set here: it carries a per-request nonce,
// so it is built in proxy.ts.
const isDev = process.env.NODE_ENV === "development";

const securityHeaders = [
  // HSTS: the app is a PWA handling financial documents and is served over
  // HTTPS in production, so pin browsers to it and remove the first-request
  // downgrade window. Deliberately WITHOUT includeSubDomains (and without
  // preload): this header is served by the app host, and pinning every
  // sibling subdomain of the production domain to HTTPS is a decision for the
  // domain owner, not a side effect of an app deploy — a single http-only
  // subdomain elsewhere would become unreachable for two years. Emitted only
  // outside development so local http:// origins are not pinned on the
  // developer's machine.
  ...(isDev
    ? []
    : [
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000",
        },
      ]),
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
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
