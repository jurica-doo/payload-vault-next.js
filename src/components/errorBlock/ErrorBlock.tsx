import { Button } from "../button/Button";
import { AlertTriangleIcon, RefreshIcon } from "../icons";

type ErrorBlockProps = {
  message?: string;
  /** Refetch handler. Without it, "Erneut versuchen" reloads the page. */
  onRetry?: () => void;
  /** "page" fills the content area; "inline" sits inside a section. */
  variant?: "page" | "inline";
};

const DEFAULT_MESSAGE =
  "Die Daten konnten nicht geladen werden. Bitte prüfen Sie Ihre Verbindung und versuchen Sie es erneut.";

export const ErrorBlock = ({
  message,
  onRetry,
  variant = "page",
}: ErrorBlockProps) => {
  const retry = onRetry ?? (() => window.location.reload());

  if (variant === "inline") {
    return (
      <div
        role="alert"
        className="flex flex-col gap-3 rounded-radius-lg border border-color-error-border/30 bg-color-bg-error-subtle p-4 sm:flex-row sm:items-center sm:justify-between animate-fade-in"
      >
        <div className="flex items-start gap-3">
          <AlertTriangleIcon
            size={18}
            className="mt-0.5 shrink-0 text-color-error-text"
          />
          <p className="text-sm text-color-error-text">
            {message || DEFAULT_MESSAGE}
          </p>
        </div>
        <Button
          text="Erneut versuchen"
          variant="secondary"
          icon={RefreshIcon}
          onClick={retry}
        />
      </div>
    );
  }

  return (
    <div className="flex min-h-[60vh] w-full items-center justify-center p-4">
      <div
        role="alert"
        className="ui-card flex max-w-md flex-col items-center p-8 text-center animate-scale-in"
      >
        <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-color-bg-error-subtle text-color-error-text">
          <AlertTriangleIcon size={26} />
        </span>
        <h2 className="mb-2 text-lg font-semibold text-color-text-main">
          Etwas ist schiefgelaufen
        </h2>
        <p className="mb-6 text-sm text-color-text-subtle">
          {message || DEFAULT_MESSAGE}
        </p>
        <Button text="Erneut versuchen" icon={RefreshIcon} onClick={retry} />
      </div>
    </div>
  );
};
