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
  <div
    role="note"
    className="flex items-start gap-2 rounded-radius-md border border-color-secondary/40 bg-color-secondary/10 px-3 py-2 text-sm text-color-text-secondary"
  >
    <span aria-hidden className="font-bold text-color-secondary">
      !
    </span>
    <p>
      <span className="font-semibold text-color-secondary">
        Vorläufige Regel ({decisionId})
      </span>{" "}
      {text ?? "Noch nicht von Profina bestätigt. Werte können sich ändern."}
    </p>
  </div>
);
