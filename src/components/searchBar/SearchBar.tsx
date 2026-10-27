import { type ChangeEvent, useEffect, useState } from "react";
import { CloseIcon, SearchIcon } from "../icons";
import { useTimeout } from "../../hooks/timeout/UseTimeout";

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  title?: string;
  placeholder?: string;
  debounceMs?: number;
}

export const SearchBar = ({
  value,
  onChange,
  title,
  placeholder = "Etwas eingeben",
  debounceMs = 0,
}: SearchBarProps) => {
  const [searchValue, setSearchValue] = useState(value ?? "");
  const timeout = useTimeout();

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    setSearchValue(e.target.value);
  };

  // Sync from the controlled prop via render adjustment (not an effect), so
  // an external reset (e.g. "Filter zurücksetzen") can't flash the old text.
  const [prevValue, setPrevValue] = useState(value);
  if (prevValue !== value) {
    setPrevValue(value);
    setSearchValue(value ?? "");
  }

  useEffect(() => {
    if (debounceMs === 0) {
      onChange(searchValue);
      return;
    }

    timeout.set(() => onChange(searchValue), debounceMs);
    return () => timeout.clear();
  }, [searchValue, debounceMs]);

  const handleClear = () => {
    setSearchValue("");
    onChange("");
    timeout.clear();
  };

  return (
    <div className="flex flex-col gap-1">
      {title && (
        <label
          htmlFor="search"
          className="cursor-pointer text-[0.8125rem] font-medium text-color-text-secondary"
        >
          {title}
        </label>
      )}
      <div className="relative flex items-center">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-3 h-[18px] w-[18px] -translate-y-1/2 text-color-text-subtle" />
        <input
          id="search"
          type="search"
          placeholder={placeholder}
          value={searchValue}
          onChange={handleInputChange}
          aria-label={title ?? placeholder}
          className="h-10 w-full rounded-radius-md border border-color-border-strong bg-color-bg-card pr-9 pl-9.5 text-sm text-color-text-main placeholder-color-text-subtle [&::-webkit-search-cancel-button]:appearance-none"
        />
        {searchValue && (
          <button
            type="button"
            onClick={handleClear}
            aria-label="Suche leeren"
            className="absolute top-1/2 right-1.5 flex h-7 w-7 -translate-y-1/2 cursor-pointer items-center justify-center rounded-radius-sm text-color-text-subtle transition-all hover:bg-color-bg-hover hover:text-color-text-main active:scale-90 animate-fade-in"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
};
