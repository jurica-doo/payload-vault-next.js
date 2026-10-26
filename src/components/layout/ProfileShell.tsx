"use client";

import { type ReactNode } from "react";
import { HeaderHome } from "../header/HeaderHome";
import { MiniFooter } from "../footer/MiniFooter";

/** Chrome for the user's own settings pages (/profil/*). */
export const ProfileShell = ({ children }: { children: ReactNode }) => (
  <div className="flex min-h-screen flex-col">
    <div className="sticky top-0 z-40">
      <HeaderHome isTwoHeaders isSticky={false} pageTitle="Profil" showYearSelector={false} />
    </div>
    <main className="flex flex-1 flex-col">
      <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">{children}</div>
      <div className="pb-6">
        <MiniFooter />
      </div>
    </main>
  </div>
);
