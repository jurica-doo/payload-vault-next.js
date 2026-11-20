import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ImpressumPage } from "../impressum/ImpressumPage";
import { DatenschutzPage } from "../datenschutz/DatenschutzPage";
import { LEGAL_OPEN_FIELDS } from "../../data/legalEntity";

describe("legal pages", () => {
  for (const [name, Page] of [["Impressum", ImpressumPage], ["Datenschutz", DatenschutzPage]] as const) {
    it(`${name}: no English template placeholders, current law references`, () => {
      const { container } = render(<Page />);
      const text = container.textContent ?? "";
      expect(text).not.toMatch(/\[(First|Street|Postal|Phone|Email|VAT)[^\]]*\]/);
      expect(text).not.toMatch(/\bTMG\b|\bRStV\b/);
      expect(text).toContain("Profina Deutschland GmbH");
    });
  }

  it("marks every missing operator detail visibly", () => {
    const { container } = render(<><ImpressumPage /><DatenschutzPage /></>);
    const marked = new Set([...container.querySelectorAll("[data-legal-open]")].map((e) => e.getAttribute("data-legal-open")));
    for (const field of LEGAL_OPEN_FIELDS) expect(marked.has(field)).toBe(true);
  });

  it("names the processors: Vercel, Supabase, Resend, Google Gemini", () => {
    const { container } = render(<DatenschutzPage />);
    for (const name of ["Vercel", "Supabase", "Resend", "Gemini"]) expect(container.textContent).toContain(name);
  });
});
