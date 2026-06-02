type SegmentedOption<T extends string> = {
  value: T;
  label: string;
};

type SegmentedToggleProps<T extends string> = {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel?: string;
};

/**
 * Pill segmented control used by the chart view switches (Donut/Balken,
 * Balken/Linie). Track and pills share a single `rounded-full` radius so the
 * active pill always nests cleanly inside the track.
 */
export function SegmentedToggle<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: SegmentedToggleProps<T>) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="inline-flex items-center gap-1 rounded-full bg-color-bg-main p-1"
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option.value)}
            className={`rounded-full px-3 py-1 text-xs transition-all duration-200 ${
              active
                ? "bg-color-primary text-color-black font-medium"
                : "text-color-text-subtle hover:text-color-text-main"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
