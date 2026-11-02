import type { KeyboardEvent, Ref, RefObject } from "react";
import type { AnchoredPosition } from "../popover/useAnchoredPosition";
import type { Option } from "./Dropdown.types";
import { DropdownItem } from "./DropdownItem";
import { SearchIcon } from "../icons";

interface DropdownListProps {
  ref: Ref<HTMLDivElement>;
  listId: string;
  optionId: (index: number) => string;
  labelledBy: string;
  options: Option[];
  activeIndex: number;
  selectedId?: string;
  onHover: (index: number) => void;
  onChoose: (option: Option) => void;
  /** Null until measured: the list stays invisible for its first frame. */
  position: AnchoredPosition | null;
  isClosing: boolean;
  /** Shows a filter field at the top (searchable dropdowns). */
  isSearchEnabled: boolean;
  searchRef: RefObject<HTMLInputElement | null>;
  searchValue: string;
  onSearchChange: (value: string) => void;
  onSearchKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
}

/** Floating option list of <Dropdown> (rendered in a portal, fixed position). */
export const DropdownList = ({
  ref,
  listId,
  optionId,
  labelledBy,
  options,
  activeIndex,
  selectedId,
  onHover,
  onChoose,
  position,
  isClosing,
  isSearchEnabled,
  searchRef,
  searchValue,
  onSearchChange,
  onSearchKeyDown,
}: DropdownListProps) => {
  const motion = !position
    ? "invisible"
    : position.up
      ? isClosing
        ? "origin-bottom animate-fade-out"
        : "origin-bottom animate-slide-up"
      : isClosing
        ? "origin-top animate-slide-up-out"
        : "origin-top animate-slide-down";

  return (
    <div
      ref={ref}
      style={
        position
          ? { top: position.top, left: position.left, right: position.right, width: position.width, maxHeight: position.maxHeight }
          : { top: 0, left: 0 }
      }
      className={`fixed z-[110] flex flex-col overflow-hidden rounded-radius-lg bg-color-surface-raised shadow-shadow-strong ring-1 ring-color-border-light ${motion}`}
    >
      {isSearchEnabled && (
        <div className="relative shrink-0 p-1.5 pb-1">
          <SearchIcon
            aria-hidden
            className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-color-text-subtle"
          />
          <input
            ref={searchRef}
            type="text"
            role="searchbox"
            aria-label="Optionen durchsuchen"
            aria-controls={listId}
            aria-activedescendant={options[activeIndex] ? optionId(activeIndex) : undefined}
            autoComplete="off"
            placeholder="Suchen"
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            onKeyDown={onSearchKeyDown}
            className="h-9 w-full rounded-radius-md border border-color-border-strong bg-color-bg-card pl-8 pr-2.5 text-sm"
          />
        </div>
      )}

      <ul id={listId} role="listbox" aria-labelledby={labelledBy} className="max-h-60 min-h-0 flex-1 overflow-y-auto p-1">
        {options.length === 0 && (
          <li role="presentation" className="p-3 text-center text-sm text-color-text-subtle">
            Keine Ergebnisse gefunden
          </li>
        )}
        {options.map((option, i) => (
          <DropdownItem
            key={option.id}
            id={optionId(i)}
            option={option}
            isActive={i === activeIndex}
            isSelected={option.id === selectedId}
            onHover={() => onHover(i)}
            onChoose={onChoose}
          />
        ))}
      </ul>
    </div>
  );
};
