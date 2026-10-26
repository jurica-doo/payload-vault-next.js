// ============================================================
// Email provider adapters (OD-11: the provider is not chosen yet)
// ============================================================
// An adapter sends one rendered message and returns the provider's message
// id. It must pass `idempotencyKey` to the provider when supported, so a
// retried claim never produces a second email.
//
//   dryrun  — logs nothing, sends nothing, reports success with a fake id.
//             For staging only (EMAIL_PROVIDER=dryrun).
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
};

export type EmailProvider = {
  name: string;
  send: (mail: OutgoingEmail, from: string) => Promise<{ messageId: string }>;
};

const dryrun: EmailProvider = {
  name: "dryrun",
  send: (mail) => Promise.resolve({ messageId: `dryrun-${mail.idempotencyKey}` }),
};

export function providerFromEnv(name: string | undefined): EmailProvider | null {
  switch (name) {
    case "dryrun":
      return dryrun;
    default:
      return null;
  }
}
