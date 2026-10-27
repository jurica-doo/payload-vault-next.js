import {
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { XIcon } from "../icons";
import type { ModalSize } from "../../context/modal/types";

interface ModalProps {
  title: string;
  onClose: () => void;
  children?: ReactNode;
  disableClose?: boolean;
  size?: ModalSize;
}

const ANIMATION_DURATION = 150;

const sizeClasses: Record<ModalSize, string> = {
  default: "sm:max-w-md",
  large: "sm:max-w-2xl",
};

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export const Modal = ({
  title,
  onClose,
  children,
  disableClose,
  size = "default",
}: ModalProps) => {
  const [isClosing, setIsClosing] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const titleId = useId();

  const handleClose = useCallback(() => {
    if (disableClose || isClosing) return;
    setIsClosing(true);
    setTimeout(onClose, ANIMATION_DURATION);
  }, [disableClose, isClosing, onClose]);

  // Scroll lock + focus management: move focus into the dialog, return it to
  // the trigger on close.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden";

    const panel = panelRef.current;
    const firstField = panel?.querySelector<HTMLElement>(
      "input:not([disabled]), select:not([disabled]), textarea:not([disabled])",
    );
    (firstField ?? panel)?.focus({ preventScroll: true });

    return () => {
      document.body.style.overflow = "";
      previouslyFocused?.focus?.({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        handleClose();
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      const items = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE),
      ).filter((el) => el.offsetParent !== null);
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [handleClose]);

  return (
    <div
      className={`fixed inset-0 z-100 flex items-end justify-center bg-color-overlay backdrop-blur-[2px] sm:items-center sm:p-4 ${
        isClosing ? "animate-fade-out" : "animate-fade-in"
      }`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`flex max-h-[92vh] w-full ${sizeClasses[size]} flex-col overflow-hidden rounded-t-radius-xl bg-color-bg-card shadow-shadow-strong outline-none sm:max-h-[88vh] sm:rounded-radius-xl ${
          isClosing
            ? "animate-scale-out"
            : "animate-sheet-up sm:animate-scale-in"
        }`}
      >
        {/* Drag handle hint on mobile sheets. */}
        <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-color-border-strong sm:hidden" />
        <div className="flex w-full items-start justify-between gap-4 border-b border-color-border-light px-5 pb-3.5 pt-3 sm:px-6 sm:pt-5">
          <h2
            id={titleId}
            className="text-[1.0625rem] font-semibold leading-snug sm:text-lg"
          >
            {title}
          </h2>
          <button
            type="button"
            onClick={handleClose}
            disabled={disableClose}
            aria-label="Dialog schließen"
            className={`-mr-2 -mt-1 shrink-0 rounded-radius-md p-2 text-color-text-subtle transition-all duration-150 ${
              disableClose
                ? "cursor-not-allowed opacity-50"
                : "cursor-pointer hover:bg-color-bg-hover hover:text-color-text-main active:scale-90"
            }`}
          >
            <XIcon size={18} />
          </button>
        </div>

        <div className="flex w-full flex-col overflow-y-auto px-5 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:px-6">
          {children}
        </div>
      </div>
    </div>
  );
};
