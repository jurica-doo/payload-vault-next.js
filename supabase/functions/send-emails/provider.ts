// ============================================================
// Email provider adapters (OD-11: Resend, chosen 2026-11-20)
// ============================================================
// An adapter sends one rendered message and returns the provider's message
// id. It must pass `idempotencyKey` to the provider when supported, so a
// retried claim never produces a second email.
//
//   dryrun  — logs nothing, sends nothing, reports success with a fake id.
//             For staging only (EMAIL_PROVIDER=dryrun).
//   resend  — production (EMAIL_PROVIDER=resend, RESEND_API_KEY).
//
// Adding the chosen provider = one more adapter here plus its secrets.
// ============================================================

export type OutgoingEmail = {
  id: string;
  idempotencyKey: string;
  to: string;
  subject: string;
  text: string;
  html: string;
  /**
   * Extra headers the adapter must set, e.g. List-Unsubscribe and
   * List-Unsubscribe-Post (RFC 8058) so mail clients show "Abmelden".
   */
  headers: Record<string, string>;
  /** The adviser's own address, so replies reach them (client mails). */
  replyTo?: string | null;
};

export type EmailProvider = {
  name: string;
  send: (mail: OutgoingEmail, from: string) => Promise<{ messageId: string }>;
};

const dryrun: EmailProvider = {
  name: "dryrun",
  send: (mail) => Promise.resolve({ messageId: `dryrun-${mail.idempotencyKey}` }),
};

/**
 * Resend (chosen provider, OD-11). Secrets: RESEND_API_KEY; EMAIL_FROM and
 * EMAIL_SENDER_DOMAIN must use a domain verified in Resend (SPF/DKIM), e.g.
 * "Profina Vuletić <noreply@profina-vuletic.de>" and "profina-vuletic.de".
 * The send-log id is passed as Idempotency-Key, so a retried claim never sends
 * twice. Only the HTTP status goes into errors, never the message content.
 */
const resend: EmailProvider = {
  name: "resend",
  send: async (mail, from) => {
    const key = Deno.env.get("RESEND_API_KEY") ?? "";
    if (!key) throw Object.assign(new Error("missing_api_key"), { name: "missing_api_key" });
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "Idempotency-Key": mail.idempotencyKey },
      body: JSON.stringify({
        from, to: [mail.to], subject: mail.subject, html: mail.html, text: mail.text, headers: mail.headers,
        ...(mail.replyTo ? { reply_to: mail.replyTo } : {}),
      }),
    });
    if (!res.ok) throw Object.assign(new Error(`http_${res.status}`), { name: `http_${res.status}` });
    const body = (await res.json()) as { id?: string };
    if (!body.id) throw Object.assign(new Error("no_message_id"), { name: "no_message_id" });
    return { messageId: body.id };
  },
};

export function providerFromEnv(name: string | undefined): EmailProvider | null {
  switch (name) {
    case "dryrun":
      return dryrun;
    case "resend":
      return resend;
    default:
      return null;
  }
}
