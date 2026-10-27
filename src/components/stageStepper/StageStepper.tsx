import { CheckIcon } from "../icons";
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
    <ol className="flex flex-wrap items-center gap-y-2 text-xs" aria-label="Phase">
      {stages.map((stage, index) => {
        const state =
          currentIndex === -1 ? "todo" : index < currentIndex ? "done" : index === currentIndex ? "current" : "todo";
        if (outcome && index > currentIndex && currentIndex !== -1) return null;
        return (
          <li
            key={stage.id}
            aria-current={state === "current" ? "step" : undefined}
            data-state={state}
            className="flex items-center"
          >
            {index > 0 && (
              <span
                aria-hidden
                className={`mx-1.5 h-px w-4 sm:w-6 transition-colors duration-300 ${
                  state === "todo" ? "bg-color-border-strong" : "bg-color-primary"
                }`}
              />
            )}
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium transition-all duration-300 ${
                state === "current"
                  ? "bg-color-primary text-color-on-primary shadow-shadow-soft"
                  : state === "done"
                    ? "bg-color-bg-accent-subtle text-color-text-accent"
                    : "bg-color-bg-alt text-color-text-subtle ring-1 ring-inset ring-color-border-light"
              }`}
            >
              {state === "done" && <CheckIcon size={12} aria-hidden />}
              {stage.label}
            </span>
          </li>
        );
      })}
      {outcome && (
        <li className="flex items-center">
          <span aria-hidden className="mx-1.5 h-px w-4 bg-color-border-strong sm:w-6" />
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-1 font-semibold animate-pop-in ${
              outcome.tone === "success"
                ? "bg-color-success/12 text-color-success-text"
                : "bg-color-bg-error-subtle text-color-error-text"
            }`}
          >
            {outcome.label}
          </span>
        </li>
      )}
    </ol>
  );
};
