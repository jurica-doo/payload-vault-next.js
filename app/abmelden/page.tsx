import type { Metadata } from "next";
import { UnsubscribePage } from "@/views/unsubscribe/UnsubscribePage";

export const metadata: Metadata = { title: "Von E-Mails abmelden – Profina", robots: { index: false, follow: false } };

/** Public: the unsubscribe link in client e-mails (no login). */
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const p = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  return <UnsubscribePage token={one(p.t)} purpose={one(p.z)} />;
}
