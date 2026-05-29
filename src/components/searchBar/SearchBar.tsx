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

  useEffect(() => {
    setSearchValue(value ?? "");
  }, [value]);

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
          className="cursor-pointer text-sm font-semibold text-color-text-secondary"
        >
          {title}
        </label>
      )}
      <div className="relative flex items-center">
        <SearchIcon className="absolute top-1/2 left-2 -translate-y-1/2 text-color-text-subtle" />
        <input
          id="search"
          type="text"
          placeholder={placeholder}
          value={searchValue}
          onChange={handleInputChange}
          className="w-full rounded-lg border border-color-border-light px-4 py-3 pl-12 text-color-text-secondary placeholder-color-text-subtle transition-all duration-200 ease-in-out focus:border-transparent focus:outline-3 focus:outline-color-bg-accent focus:shadow-shadow-medium"
        />
        {searchValue && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute top-1/2 right-2 -translate-y-1/2 cursor-pointer"
          >
            <CloseIcon className="text-color-text-subtle" />
          </button>
        )}
      </div>
    </div>
  );
};
