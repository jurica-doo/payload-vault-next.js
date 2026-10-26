"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "../../components/button/Button";
import { DuplicateWarning } from "../../components/duplicateWarning/DuplicateWarning";
import { useBanner } from "../../context/banner/BannerContext";
import { customerNo, findCustomerDuplicates, useCustomerMutations, type CustomerDuplicate } from "../../hooks/useCustomers/useCustomers";
import type { Lead } from "../../hooks/useLeads/useLeads";

/**
 * Lead → customer (§9.1 Conversion, §14.5). Checks for an existing customer
 * first; the customer keeps the link to the lead and so to its source.
 */
export const ConvertLead = ({ lead }: { lead: Lead }) => {
  const { convertLead } = useCustomerMutations();
  const { showBanner } = useBanner();
  const router = useRouter();
  const [dupes, setDupes] = useState<CustomerDuplicate[] | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  if (lead.customer_id) {
    return <Link href={`/vertrieb/kunden/${lead.customer_id}`} className="text-sm font-semibold">Zum Kunden →</Link>;
  }
  if (!lead.owner_id) return null;

  const run = async () => {
    try {
      if (dupes === null) {
        const found = await findCustomerDuplicates({
          first_name: lead.first_name ?? "", last_name: lead.last_name ?? "", company: lead.company ?? "", phone: lead.phone, email: lead.email,
        });
        setDupes(found);
        if (found.length > 0) return;
      }
      const id = await convertLead.mutateAsync({ leadId: lead.id, confirmDuplicates: confirmed });
      router.push(`/vertrieb/kunden/${id}`);
    } catch (e) {
      showBanner("Nicht umgewandelt", e instanceof Error ? e.message : "", "error");
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {dupes && dupes.length > 0 && (
        <DuplicateWarning confirmed={confirmed} onConfirmedChange={setConfirmed} hiddenLabel="Kunde einer anderen Person"
          items={dupes.map((d, i) => ({
            key: d.id ?? String(i), reason: d.reason, owner: d.owner,
            ...(d.visible && d.id ? { href: `/vertrieb/kunden/${d.id}`, label: `${customerNo(d.customer_no ?? 0)} ${d.name}` } : {}),
          }))} />
      )}
      <div>
        <Button text="In Kunden umwandeln" isLoading={convertLead.isPending}
          isDisabled={dupes !== null && dupes.length > 0 && !confirmed} onClick={run} />
      </div>
    </div>
  );
};
