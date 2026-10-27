import { Notice } from "../notice/Notice";

/**
 * Shown next to every number that depends on an unconfirmed business rule
 * (IMPLEMENTATION_PLAN.md §9). Users must be able to tell a provisional
 * figure from a confirmed one; the decision ID makes it traceable.
 */
export const ProvisionalRuleNotice = ({
  decisionId,
  text,
}: {
  decisionId: string;
  text?: string;
}) => (
  <Notice tone="warning" compact title={`Vorläufige Regel (${decisionId})`}>
    {text ?? "Noch nicht von Profina bestätigt. Werte können sich ändern."}
  </Notice>
);
