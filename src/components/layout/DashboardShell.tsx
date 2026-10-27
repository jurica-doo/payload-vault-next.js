"use client";

import { type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { AppShell } from "./AppShell";
import { PdfImportFooter } from "../pdfImport/PdfImportFooter";
import { ExpensePdfImportFooter } from "../pdfImport/ExpensePdfImportFooter";
import { BulkSelectProvider } from "../../context/BulkSelectContext";
import { useYear } from "../../hooks/year/UseYear";
import { useTitle } from "../../context/title/TitleContext";

/**
 * Chrome shared by the einnahmen / steuerrelevante-ausgaben routes: the app
 * shell with the year filter, a title fed by child pages via
 * {@link useTitle}, and the upload action as the page's primary CTA.
 */
export const DashboardShell = ({ children }: { children: ReactNode }) => {
  const { title } = useTitle();
  const { year } = useYear();
  const pathname = usePathname();
  const isSales = pathname.includes("/einnahmen");

  return (
    <BulkSelectProvider>
      <AppShell
        title={title}
        subtitle={`Geschäftsjahr ${year}`}
        showYearSelector
        actions={isSales ? <PdfImportFooter /> : <ExpensePdfImportFooter />}
      >
        {children}
      </AppShell>
    </BulkSelectProvider>
  );
};
