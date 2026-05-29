import {
  useEffect,
  useId,
  useRef,
  useState,
  type ComponentType,
  type SVGProps,
} from "react";
import { DropdownList } from "./DropdownList";
import { ArrowIcon } from "../icons";
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
    <div ref={dropdownRef} className="flex flex-col gap-1">
      {label && (
        <label
          htmlFor={id}
          className="flex h-6 cursor-pointer items-center font-semibold tracking-[-0.15px]"
        >
          {isRequired && (
            <span className="text-[24px] leading-none text-color-text-secondary">
              *
            </span>
          )}
          <span className="ml-1 text-sm text-color-text-secondary">
            {label}
          </span>
        </label>
      )}
      <div className="relative w-full">
        <button
          id={id}
          type="button"
          onClick={handleToggle}
          className={`
            flex w-full cursor-pointer items-center justify-between
            px-4 py-3
            ${radiusVariants[variant]}
            ring-2 ring-transparent
            transition-all duration-200 ease-in-out
            ${isOpen && !isClosing ? "ring-color-bg-accent" : ""}
            ${
              error
                ? "border border-color-error-border bg-color-error/10"
                : "border border-color-border-light bg-color-bg-main"
            }`}
        >
          <div className="flex items-center gap-3">
            {MainIcon && <MainIcon />}
            <p
              className={`align-middle leading-6 ${
                isPlaceholderActive
                  ? "text-color-text-subtle"
                  : "text-color-text-main"
              }`}
            >
              {displayText}
            </p>
          </div>

          <ArrowIcon
            className={`text-color-text-secondary transition-transform duration-400 ease-in-out ${
              isOpen && !isClosing ? "rotate-90" : "-rotate-90"
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
        <p className="mt-1 text-[16px] font-medium text-color-error-text">
          {error}
        </p>
      )}
    </div>
  );
};
