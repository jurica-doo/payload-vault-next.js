import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

// Self-hosted by next/font: no request reaches Google at runtime.
const inter = Inter({
  subsets: ["latin", "latin-ext"],
  variable: "--font-inter",
  display: "swap",
});

// iOS splash screens (generated with pwa-asset-generator from
// public/pwa-icon-source.svg). Without these, an installed PWA cold-starts
// to a plain white screen on iOS.
const appleSplashScreens = [
  { w: 1032, h: 1376, r: 2, src: "apple-splash-2064-2752" },
  { w: 1024, h: 1366, r: 2, src: "apple-splash-2048-2732" },
  { w: 834, h: 1210, r: 2, src: "apple-splash-1668-2420" },
  { w: 834, h: 1194, r: 2, src: "apple-splash-1668-2388" },
  { w: 834, h: 1112, r: 2, src: "apple-splash-1668-2224" },
  { w: 768, h: 1024, r: 2, src: "apple-splash-1536-2048" },
  { w: 820, h: 1180, r: 2, src: "apple-splash-1640-2360" },
  { w: 810, h: 1080, r: 2, src: "apple-splash-1620-2160" },
  { w: 744, h: 1133, r: 2, src: "apple-splash-1488-2266" },
  { w: 440, h: 956, r: 3, src: "apple-splash-1320-2868" },
  { w: 402, h: 874, r: 3, src: "apple-splash-1206-2622" },
  { w: 420, h: 912, r: 3, src: "apple-splash-1260-2736" },
  { w: 430, h: 932, r: 3, src: "apple-splash-1290-2796" },
  { w: 393, h: 852, r: 3, src: "apple-splash-1179-2556" },
  { w: 390, h: 844, r: 3, src: "apple-splash-1170-2532" },
  { w: 428, h: 926, r: 3, src: "apple-splash-1284-2778" },
  { w: 360, h: 780, r: 3, src: "apple-splash-1080-2340" },
  { w: 414, h: 896, r: 3, src: "apple-splash-1242-2688" },
  { w: 375, h: 812, r: 3, src: "apple-splash-1125-2436" },
  { w: 414, h: 896, r: 2, src: "apple-splash-828-1792" },
  { w: 414, h: 736, r: 3, src: "apple-splash-1242-2208" },
  { w: 375, h: 667, r: 2, src: "apple-splash-750-1334" },
  { w: 320, h: 568, r: 2, src: "apple-splash-640-1136" },
].map(({ w, h, r, src }) => ({
  url: `/splash/${src}.png`,
  media: `(device-width: ${w}px) and (device-height: ${h}px) and (-webkit-device-pixel-ratio: ${r}) and (orientation: portrait)`,
}));

export const metadata: Metadata = {
  title: "Profina Payload Vault",
  description:
    "Profina Payload Vault — Belege, Einnahmen und steuerrelevante Ausgaben verwalten.",
  applicationName: "Payload Vault",
  manifest: "/manifest.webmanifest",
  formatDetection: { telephone: false },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "48x48" },
      { url: "/favicon.svg", type: "image/svg+xml", sizes: "any" },
    ],
    apple: "/apple-touch-icon-180x180.png",
    other: [{ rel: "mask-icon", url: "/favicon.svg", color: "#00c4b3" }],
  },
  appleWebApp: {
    capable: true,
    title: "Payload Vault",
    statusBarStyle: "black-translucent",
    startupImage: appleSplashScreens,
  },
  other: {
    "mobile-web-app-capable": "yes",
    "msapplication-TileColor": "#00c4b3",
    "msapplication-tap-highlight": "no",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  colorScheme: "dark light",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0b1115" },
    { media: "(prefers-color-scheme: light)", color: "#f5f7f9" },
  ],
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Set per request by proxy.ts; the CSP refuses inline scripts without it.
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html
      lang="de"
      translate="no"
      className={inter.variable}
      suppressHydrationWarning
    >
      <head>
        {/* Sets data-theme BEFORE first paint so the loading screen (and
            everything else) renders in the right theme immediately. No saved
            choice means "system" (see src/utils/theme.ts). */}
        <script
          nonce={nonce}
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem("theme");if(t!=="light"&&t!=="dark"){t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";}document.documentElement.dataset.theme=t;}catch(e){}`,
          }}
        />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
