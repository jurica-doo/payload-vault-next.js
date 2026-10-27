"use client";

import { MfaRequiredNotice } from "../../components/mfa/MfaRequiredNotice";
import { usePermissions } from "../../hooks/permissions/usePermissions";
import { TemplatesSection } from "./TemplatesSection";
import { CampaignsSection, SendLogSection, SuppressionsSection, SwitchSection } from "./SendingSections";

/** Customer communication (§10.2): templates, campaigns, suppressions, send log. Admin/compliance. */
export const CommunicationPage = () => {
  const { permissions } = usePermissions();
  if (!(permissions.isAdmin || permissions.isCompliance)) return <p className="text-sm">Nur für Administratoren und Compliance.</p>;
  return (
    <div className="flex flex-col gap-4">
      {!permissions.hasMfa && <MfaRequiredNotice />}
      <SwitchSection />
      <TemplatesSection />
      <CampaignsSection />
      <div className="grid gap-4 lg:grid-cols-2">
        <SuppressionsSection />
        <SendLogSection />
      </div>
    </div>
  );
};
