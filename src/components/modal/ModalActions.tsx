import type { ReactNode } from "react";

/**
 * Footer row for dialogs and forms: actions right-aligned with the primary
 * last (closest to the thumb/pointer path); stacked full-width on phones
 * with the primary on top.
 */
export const ModalActions = ({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) => (
  <div
    className={`mt-2 flex flex-col-reverse gap-2 border-t border-color-border-light pt-4 sm:flex-row sm:items-center sm:justify-end [&>button]:w-full sm:[&>button]:w-auto ${className}`}
  >
    {children}
  </div>
);
