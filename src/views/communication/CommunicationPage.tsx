"use client";

import Link from "next/link";
import { MfaRequiredNotice } from "../../components/mfa/MfaRequiredNotice";
import { usePermissions } from "../../hooks/permissions/usePermissions";
import { TemplatesSection } from "./TemplatesSection";

/** Customer communication (§10.2): templates, campaigns, suppressions, send log. Admin/compliance. */
export const CommunicationPage = () => {
  const { permissions } = usePermissions();
  if (!(permissions.isAdmin || permissions.isCompliance)) return <p className="text-sm">Nur für Administratoren und Compliance.</p>;
  return (
    <div className="flex flex-col gap-4">
      <Link href="/vertrieb/kunden" className="text-sm font-semibold">← Kunden</Link>
      {!permissions.hasMfa && <MfaRequiredNotice />}
      <TemplatesSection />
    </div>
  );
};
