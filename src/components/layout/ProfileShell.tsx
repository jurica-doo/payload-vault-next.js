"use client";

import { type ReactNode } from "react";
import { AppShell } from "./AppShell";

/** Chrome for the user's own settings pages (/profil/*). */
export const ProfileShell = ({ children }: { children: ReactNode }) => (
  <AppShell title="Profil" width="narrow">
    {children}
  </AppShell>
);
