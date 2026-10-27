"use client";

import {
  createContext,
  useContext,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

type Ctx = {
  target: HTMLElement | null;
  setTarget: (el: HTMLElement | null) => void;
};

const PageActionsContext = createContext<Ctx | null>(null);

/** Provided by the shell that renders the PageHeader. */
export const PageActionsProvider = ({ children }: { children: ReactNode }) => {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  return (
    <PageActionsContext.Provider value={{ target, setTarget }}>
      {children}
    </PageActionsContext.Provider>
  );
};

/** The header's action slot; registers itself as the portal target. */
export const PageActionsSlot = () => {
  const ctx = useContext(PageActionsContext);
  return (
    <div
      ref={ctx?.setTarget}
      className="flex flex-wrap items-center gap-2 empty:hidden"
    />
  );
};

/**
 * Lets a view put its primary action into the page header while keeping
 * the handler code in the view. Without a header slot it renders inline.
 */
export const PageActions = ({ children }: { children: ReactNode }) => {
  const ctx = useContext(PageActionsContext);
  if (ctx?.target) return createPortal(children, ctx.target);
  if (ctx) return null; // slot not mounted yet; avoids a flash inline
  return <div className="flex flex-wrap items-center gap-2">{children}</div>;
};
