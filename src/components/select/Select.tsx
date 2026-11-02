"use client";

import { Dropdown } from "../dropdown/Dropdown";

export type SelectOption = { value: string; label: string; disabled?: boolean };

type SelectProps = {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  isRequired?: boolean;
  isDisabled?: boolean;
  /** Filter field in the list, for long lists. */
  isSearchEnabled?: boolean;
  size?: "sm" | "md";
  /** Accessible name when there is no visible label. */
  ariaLabel?: string;
  error?: string;
  /** Stretch to the container instead of fitting the longest option. */
  fullWidth?: boolean;
};

/**
 * Select for string values (the drop-in for a native <select>). Built on
 * <Dropdown>, so it looks and behaves the same in every browser. Like a
 * native select it is as wide as its longest option, so the field does not
 * change width when the choice changes.
 */
export const Select = ({
  label,
  value,
  onChange,
  options,
  placeholder,
  isRequired,
  isDisabled,
  isSearchEnabled,
  size,
  ariaLabel,
  error,
  fullWidth = false,
}: SelectProps) => {
  const items = options.map((o) => ({ id: o.value, label: o.label, disabled: o.disabled }));
  const longest = Math.max(placeholder?.length ?? 0, ...options.map((o) => o.label.length));

  return (
    <div style={fullWidth ? undefined : { minWidth: `min(100%, calc(${longest}ch + 3.25rem))` }}>
      <Dropdown
        label={label}
        ariaLabel={ariaLabel}
        options={items}
        value={items.find((o) => o.id === value) ?? null}
        onSelect={(o) => onChange(o.id)}
        placeholder={placeholder}
        isRequired={isRequired}
        isDisabled={isDisabled}
        isSearchEnabled={isSearchEnabled}
        size={size}
        error={error}
      />
    </div>
  );
};
