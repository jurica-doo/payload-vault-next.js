import type { Option } from "./Dropdown.types";
import { DropdownItem } from "./DropdownItem";
import { SearchBar } from "../searchBar/SearchBar";
import { useState } from "react";

interface DropdownListProps {
  options: Option[];
  isSearchEnabled: boolean;
  onSelect: (item: Option) => void;
  isClosing?: boolean;
}

export const DropdownList = ({
  options,
  isSearchEnabled,
  onSelect,
  isClosing = false,
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
      className={`absolute z-60 mt-2 w-full overflow-hidden rounded-md border border-color-border-light bg-color-bg-dark shadow-md ${isClosing ? "animate-slide-up-out" : "animate-slide-down"}`}
    >
      {isSearchEnabled && (
        <div className="p-3">
          <SearchBar value={search} onChange={setSearch} placeholder="Suchen" />
        </div>
      )}

      <ul className="max-h-60 overflow-y-auto">
        {filtered.length === 0 && (
          <li className="p-2 text-center text-color-text-secondary">
            Keine Ergebnisse gefunden
          </li>
        )}

        {filtered.map((option) => (
          <DropdownItem
            key={option.id}
            option={option}
            onClick={handleSelectItem}
          />
        ))}
      </ul>
    </div>
  );
};
