import type { Option } from "./Dropdown.types";
import { CheckIcon } from "../icons";

interface DropdownItemProps {
  id: string;
  option: Option;
  isActive: boolean;
  isSelected: boolean;
  onHover: () => void;
  onChoose: (option: Option) => void;
}

/** One option. Never takes focus: the field keeps it (aria-activedescendant). */
export const DropdownItem = ({ id, option, isActive, isSelected, onHover, onChoose }: DropdownItemProps) => {
  const Icon = option.icon;

  return (
    <li
      id={id}
      role="option"
      aria-selected={isSelected}
      aria-disabled={option.disabled || undefined}
      onMouseDown={(e) => e.preventDefault()}
      onMouseMove={isActive || option.disabled ? undefined : onHover}
      onClick={() => onChoose(option)}
      className={`flex min-h-9 items-center gap-2.5 rounded-radius-md px-2.5 py-1.5 text-left transition-colors duration-100 ${
        option.disabled ? "cursor-not-allowed opacity-45" : "cursor-pointer"
      } ${isActive && !option.disabled ? "bg-color-bg-hover" : ""}`}
    >
      {Icon && <Icon className="h-[18px] w-[18px] shrink-0" />}
      <span
        className={`min-w-0 flex-1 text-sm leading-6 ${
          isSelected ? "font-medium text-color-text-accent" : "text-color-text-main"
        }`}
      >
        {option.label}
      </span>
      {isSelected && <CheckIcon size={16} className="shrink-0 text-color-primary animate-pop-in" />}
    </li>
  );
};
