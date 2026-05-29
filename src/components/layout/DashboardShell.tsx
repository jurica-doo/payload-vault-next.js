"use client";

import { type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { HeaderHome } from "../header/HeaderHome";
import { MiniFooter } from "../footer/MiniFooter";
import { PdfImportFooter } from "../pdfImport/PdfImportFooter";
import { ExpensePdfImportFooter } from "../pdfImport/ExpensePdfImportFooter";
import { BulkSelectProvider } from "../../context/BulkSelectContext";
import { useYear } from "../../hooks/year/UseYear";
import { useTitle } from "../../context/title/TitleContext";

/**
 * Chrome shared by the einnahmen / steuerrelevante-ausgaben routes.
 * Mirrors the old react-router `Layout` (pages/layout.tsx): a sticky
 * two-row header whose title is fed by child pages via {@link useTitle},
 * a scrolling main area, and the contextual PDF import footer.
 */
export const DashboardShell = ({ children }: { children: ReactNode }) => {
  const { title } = useTitle();
  const { year } = useYear();
  const pathname = usePathname();
  const isSales = pathname.includes("/einnahmen");

  return (
    <BulkSelectProvider>
      <div className="flex flex-col min-h-screen">
        <div className="sticky top-0 z-40">
          <HeaderHome
            isTwoHeaders
            isSticky={false}
            pageTitle={title}
            pageSubtitle={year.toString()}
          />
        </div>

        <main className="flex-1 flex flex-col">
          <div className="flex-1">{children}</div>
          <div className="pb-20">
            <MiniFooter />
          </div>
        </main>

        {isSales ? <PdfImportFooter /> : <ExpensePdfImportFooter />}
      </div>
    </BulkSelectProvider>
  );
};
