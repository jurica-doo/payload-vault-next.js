import { createContext, useCallback, useContext, useRef } from "react";

type BulkSelectContextValue = {
  exitSelectionMode: () => void;
  registerExit: (fn: () => void) => void;
  unregisterExit: () => void;
};

const noop = () => {};

export const BulkSelectContext = createContext<BulkSelectContextValue>({
  exitSelectionMode: noop,
  registerExit: noop,
  unregisterExit: noop,
});

export const useBulkSelectContext = () => useContext(BulkSelectContext);

/** Place this provider in the Layout so both pages and footers share it. */
export const BulkSelectProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const exitRef = useRef<() => void>(noop);

  const registerExit = useCallback((fn: () => void) => {
    exitRef.current = fn;
  }, []);

  const unregisterExit = useCallback(() => {
    exitRef.current = noop;
  }, []);

  const exitSelectionMode = useCallback(() => {
    exitRef.current();
  }, []);

  return (
    <BulkSelectContext.Provider
      value={{ exitSelectionMode, registerExit, unregisterExit }}
    >
      {children}
    </BulkSelectContext.Provider>
  );
};
