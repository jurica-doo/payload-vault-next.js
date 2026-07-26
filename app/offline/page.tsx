import type { Metadata } from "next";
import { OfflineView } from "@/views/offline/OfflineView";

export const metadata: Metadata = {
  title: "Offline — Profina Payload Vault",
};

// Precached by the service worker; shown when a navigation fails offline.
export default function Page() {
  return <OfflineView />;
}
