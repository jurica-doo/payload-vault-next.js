interface EmptyStateProps {
  message?: string;
  hint?: string;
}

export const EmptyState = ({
  message = "Keine Dokumente gefunden",
  hint,
}: EmptyStateProps) => {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center animate-fade-in">
      <svg
        className="w-16 h-16 text-color-text-secondary/40 mb-4"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m6.75 12H9.75m3 3H8.25A2.25 2.25 0 0 1 6 15.375V3.75A2.25 2.25 0 0 1 8.25 1.5h3.068a2.25 2.25 0 0 1 1.591.659l5.432 5.432a2.25 2.25 0 0 1 .659 1.59V15.375A2.25 2.25 0 0 1 17.75 17.625Z"
        />
      </svg>
      <p className="text-color-text-secondary text-base font-medium">
        {message}
      </p>
      {hint && (
        <p className="text-color-text-secondary/60 text-sm mt-1">{hint}</p>
      )}
    </div>
  );
};
