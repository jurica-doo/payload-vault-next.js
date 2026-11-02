import type { Option } from "./Dropdown.types";
import { DropdownItem } from "./DropdownItem";
import { SearchBar } from "../searchBar/SearchBar";
import { useState } from "react";

interface DropdownListProps {
  options: Option[];
  isSearchEnabled: boolean;
  onSelect: (item: Option) => void;
  isClosing?: boolean;
  selectedId?: string;
  placement?: "bottom" | "top";
  size?: "sm" | "md";
}

export const DropdownList = ({
  options,
  isSearchEnabled,
  onSelect,
  isClosing = false,
  selectedId,
  placement = "bottom",
  size = "md",
}: DropdownListProps) => {
  const [search, setSearch] = useState("");

  const filtered = options.filter((option) =>
    option.label.toLowerCase().includes(search.toLowerCase()),
  );

  const handleSelectItem = (option: Option) => {
    onSelect(option);
    setSearch("");
  };

  return (
    <div
      role="listbox"
      className={`absolute z-60 w-full ${size === "sm" ? "min-w-full" : "min-w-40"} overflow-hidden rounded-radius-lg bg-color-surface-raised p-1 shadow-shadow-strong ring-1 ring-color-border-light ${
        placement === "top"
          ? `bottom-full mb-1.5 ${isClosing ? "animate-fade-out" : "animate-slide-up"}`
          : `mt-1.5 ${isClosing ? "animate-slide-up-out" : "animate-slide-down"}`
      }`}
    >
      {isSearchEnabled && (
        <div className="p-1.5 pb-2">
          <SearchBar value={search} onChange={setSearch} placeholder="Suchen" />
        </div>
      )}

      <ul className="max-h-60 overflow-y-auto">
        {filtered.length === 0 && (
          <li className="p-3 text-center text-sm text-color-text-subtle">
            Keine Ergebnisse gefunden
          </li>
        )}

        {filtered.map((option) => (
          <DropdownItem
            key={option.id}
            option={option}
            isSelected={option.id === selectedId}
            onClick={handleSelectItem}
          />
        ))}
      </ul>
    </div>
  );
};
