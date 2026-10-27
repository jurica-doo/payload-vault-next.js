import {
  useEffect,
  useId,
  useRef,
  useState,
  type ComponentType,
  type SVGProps,
} from "react";
import { DropdownList } from "./DropdownList";
import { ChevronDownIcon } from "../icons";
import { type DropdownProps, type Option } from "./Dropdown.types";
import { radiusVariants } from "./Dropdown.const";

export const Dropdown = ({
  options,
  value,
  onSelect,
  label,
  placeholder,
  isRequired,
  customIcon,
  isSearchEnabled = false,
  variant = "default",
  error,
}: DropdownProps) => {
  const id = useId();
  const [isOpen, setIsOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const animateClose = () => {
    if (isClosing) return;
    setIsClosing(true);
    setTimeout(() => {
      setIsOpen(false);
      setIsClosing(false);
    }, 150);
  };

  const handleSelect = (option: Option) => {
    animateClose();
    onSelect(option);
  };
  const handleToggle = () => {
    if (isOpen && !isClosing) {
      animateClose();
    } else if (!isOpen) {
      setIsOpen(true);
    }
  };

  const MainIcon: ComponentType<SVGProps<SVGSVGElement>> | undefined =
    customIcon ?? value?.icon;

  const isPlaceholderActive = !value && !!placeholder;
  const displayText = isPlaceholderActive ? placeholder : (value?.label ?? "");

  useEffect(() => {
    if (!isOpen || isClosing) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (!dropdownRef.current) return;
      if (!dropdownRef.current.contains(e.target as Node)) {
        animateClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen, isClosing]);

  return (
    <div ref={dropdownRef} className="flex flex-col gap-1.5">
      {label && (
        <label
          htmlFor={id}
          className="flex cursor-pointer items-center gap-0.5 text-[0.8125rem] font-medium text-color-text-secondary"
        >
          <span>{label}</span>
          {isRequired && (
            <span aria-hidden className="text-color-error-text">
              *
            </span>
          )}
        </label>
      )}
      <div className="relative w-full">
        <button
          id={id}
          type="button"
          onClick={handleToggle}
          aria-haspopup="listbox"
          aria-expanded={isOpen && !isClosing}
          className={`
            flex h-10 w-full cursor-pointer items-center justify-between gap-2
            px-3
            ${radiusVariants[variant]}
            transition-[border-color,box-shadow,background-color] duration-150 ease-out
            ${isOpen && !isClosing ? "border-color-primary! shadow-[0_0_0_3px_var(--color-focus-ring)]" : ""}
            ${
              error
                ? "border border-color-error-border bg-color-bg-card"
                : "border border-color-border-strong bg-color-bg-card hover:border-color-text-subtle"
            }`}
        >
          <div className="flex min-w-0 items-center gap-2.5">
            {MainIcon && <MainIcon className="h-[18px] w-[18px] shrink-0" />}
            <p
              className={`truncate text-sm leading-6 ${
                isPlaceholderActive
                  ? "text-color-text-subtle"
                  : "text-color-text-main"
              }`}
            >
              {displayText}
            </p>
          </div>

          <ChevronDownIcon
            size={16}
            className={`shrink-0 text-color-text-subtle transition-transform duration-200 ease-out ${
              isOpen && !isClosing ? "rotate-180" : ""
            }`}
          />
        </button>

        {(isOpen || isClosing) && (
          <DropdownList
            options={options}
            isSearchEnabled={isSearchEnabled}
            onSelect={handleSelect}
            isClosing={isClosing}
          />
        )}
      </div>

      {error && (
        <p className="text-[0.8125rem] text-color-error-text">
          {error}
        </p>
      )}
    </div>
  );
};
