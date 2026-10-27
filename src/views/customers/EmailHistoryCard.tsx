"use client";

import { StatusBadge } from "../../components/statusBadge/StatusBadge";
import { useCustomerEmails } from "../../hooks/useEmail/useEmail";
import { formatDate, formatDateTime } from "../../utils/format";
import { SEND_STATUS, SUPPRESSION_REASON } from "../communication/emailLabels";

/** Per-customer send history incl. why a mail was not sent (§10.1, §14.6). */
export const EmailHistoryCard = ({ customerId }: { customerId: string }) => {
  const { data = [] } = useCustomerEmails(customerId);
  if (data.length === 0) return null;
  return (
    <section className="flex flex-col gap-2 ui-card p-4 sm:p-5">
      <h2 className="text-base font-semibold">Automatische E-Mails</h2>
      <ul className="text-sm">
        {data.map((r) => (
          <li key={r.id}>
            {formatDate(r.occasion_date)} · <StatusBadge status={r.status} map={SEND_STATUS} />
            {r.suppression_reason && <span className="text-xs text-color-text-subtle"> · {SUPPRESSION_REASON[r.suppression_reason] ?? r.suppression_reason}</span>}
            {r.sent_at && <span className="text-xs text-color-text-subtle"> · {formatDateTime(r.sent_at)}</span>}
          </li>
        ))}
      </ul>
    </section>
  );
};
