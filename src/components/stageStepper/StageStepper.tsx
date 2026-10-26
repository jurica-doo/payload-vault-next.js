export type Stage = { id: string; label: string };

/**
 * Pipeline position (§9.2). Stages before the current one are "done", the
 * current one has aria-current="step". A terminal outcome that isn't on the
 * main path (e.g. "Verloren") is passed as `outcome` and replaces the tail.
 */
export const StageStepper = ({
  stages,
  currentId,
  outcome,
}: {
  stages: Stage[];
  currentId: string;
  outcome?: { label: string; tone: "success" | "error" };
}) => {
  const currentIndex = stages.findIndex((s) => s.id === currentId);

  return (
    <ol className="flex flex-wrap items-center gap-1 text-xs" aria-label="Phase">
      {stages.map((stage, index) => {
        const state =
          currentIndex === -1 ? "todo" : index < currentIndex ? "done" : index === currentIndex ? "current" : "todo";
        if (outcome && index > currentIndex && currentIndex !== -1) return null;
        return (
          <li
            key={stage.id}
            aria-current={state === "current" ? "step" : undefined}
            data-state={state}
            className={`rounded-full border px-2 py-0.5 ${
              state === "current"
                ? "border-color-primary bg-color-bg-accent-subtle font-semibold text-color-text-accent"
                : state === "done"
                  ? "border-color-border-light text-color-text-secondary"
                  : "border-dashed border-color-border-light text-color-text-subtle"
            }`}
          >
            {state === "done" && <span aria-hidden>✓ </span>}
            {stage.label}
          </li>
        );
      })}
      {outcome && (
        <li
          className={`rounded-full border px-2 py-0.5 font-semibold ${
            outcome.tone === "success"
              ? "border-color-success-border text-color-success-text"
              : "border-color-error-border text-color-error-text"
          }`}
        >
          {outcome.label}
        </li>
      )}
    </ol>
  );
};
