"use client";

import { createContext, useRef, useState, type FormEvent, type FormHTMLAttributes, type ReactNode } from "react";

/** True while the surrounding <Form> is submitting; submit Buttons read it to show loading and stay disabled. */
export const FormPendingContext = createContext(false);

type FormProps = Omit<FormHTMLAttributes<HTMLFormElement>, "onSubmit"> & {
  /** May return a promise; further submits are ignored until it settles. */
  onSubmit: (e: FormEvent<HTMLFormElement>) => unknown;
  children: ReactNode;
};

/**
 * A <form> that submits once: a double-click or a second Enter while the
 * first submit is still running is ignored (P4-R2-01). The guard is a ref,
 * so it holds before React has rendered the pending state.
 */
export const Form = ({ onSubmit, children, ...rest }: FormProps) => {
  const busy = useRef(false);
  const [pending, setPending] = useState(false);
  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    const done = () => {
      busy.current = false;
      setPending(false);
    };
    try {
      Promise.resolve(onSubmit(e)).finally(done);
    } catch (err) {
      done();
      throw err;
    }
  };
  return (
    <FormPendingContext.Provider value={pending}>
      <form {...rest} onSubmit={handleSubmit} aria-busy={pending || undefined}>
        {children}
      </form>
    </FormPendingContext.Provider>
  );
};
