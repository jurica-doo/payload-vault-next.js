import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "./providers";

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
    { media: "(prefers-color-scheme: dark)", color: "#0d0d0d" },
    { media: "(prefers-color-scheme: light)", color: "#00c4b3" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de" translate="no">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
