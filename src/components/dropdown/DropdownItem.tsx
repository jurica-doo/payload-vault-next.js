import type { Option } from "./Dropdown.types";

interface DropdownItemProps {
  option: Option;
  onClick: (option: Option) => void;
}

export const DropdownItem = ({ option, onClick }: DropdownItemProps) => {
  const Icon = option.icon;
  const handleClick = () => onClick(option);

  return (
    <button
      type="button"
      role="option"
      aria-selected={false}
      className="flex h-9 w-full cursor-pointer items-center gap-2.5 rounded-radius-md px-2.5 text-left transition-colors duration-100 hover:bg-color-bg-hover active:bg-color-bg-accent-subtle focus:bg-color-bg-hover focus:outline-none"
      onClick={handleClick}
    >
      {Icon && <Icon className="h-[18px] w-[18px] shrink-0" />}
      <p className="flex h-full w-full items-center truncate text-sm leading-6 text-color-text-main">
        {option.label}
      </p>
    </button>
  );
};
