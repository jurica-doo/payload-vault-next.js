import type { Option } from "./Dropdown.types";
import { CheckIcon } from "../icons";

interface DropdownItemProps {
  option: Option;
  onClick: (option: Option) => void;
  isSelected?: boolean;
}

export const DropdownItem = ({ option, onClick, isSelected = false }: DropdownItemProps) => {
  const Icon = option.icon;
  const handleClick = () => onClick(option);

  return (
    <button
      type="button"
      role="option"
      aria-selected={isSelected}
      className="flex h-9 w-full cursor-pointer items-center gap-2.5 rounded-radius-md px-2.5 text-left transition-colors duration-100 hover:bg-color-bg-hover active:bg-color-bg-accent-subtle focus:bg-color-bg-hover focus:outline-none"
      onClick={handleClick}
    >
      {Icon && <Icon className="h-[18px] w-[18px] shrink-0" />}
      <p
        className={`flex h-full w-full items-center truncate text-sm leading-6 ${
          isSelected ? "font-medium text-color-text-accent" : "text-color-text-main"
        }`}
      >
        {option.label}
      </p>
      {isSelected && <CheckIcon size={16} className="shrink-0 text-color-primary animate-pop-in" />}
    </button>
  );
};
