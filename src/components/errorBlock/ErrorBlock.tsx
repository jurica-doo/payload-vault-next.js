import { Button } from "../button/Button";

export const ErrorBlock = ({ message }: { message?: string }) => {
  return (
    <div className="w-screen h-screen flex items-center justify-center">
      <div className="flex flex-col items-center justify-center p-8 m-4 bg-color-bg-card border border-color-error rounded-radius-lg shadow-shadow-strong text-center animate-scale-in">
        <div className="text-6xl mb-4 animate-bounce">🚨</div>
        <h2 className="text-h2 mb-2 text-color-error-text">
          Hoppla! Etwas ist schiefgelaufen.
        </h2>
        <p className="text-body mb-4 text-color-text-subtle">
          {message ||
            "Wir konnten den Server nicht erreichen. Vielleicht versteckt er sich vor uns?"}
        </p>
        <Button
          text="Erneut versuchen"
          onClick={() => window.location.reload()}
        />
      </div>
    </div>
  );
};
