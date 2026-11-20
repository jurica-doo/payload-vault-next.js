import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DetailLayout, RecordHeader } from "./DetailLayout";

describe("RecordHeader", () => {
  it("offers one-tap call and e-mail when the record has them", () => {
    render(<RecordHeader title="Sabine Kowalski" contact={{ phone: "+491712345678", email: "sabine@example.org" }} />);
    expect(screen.getByRole("link", { name: "Anrufen" })).toHaveAttribute("href", "tel:+491712345678");
    expect(screen.getByRole("link", { name: "E-Mail schreiben" })).toHaveAttribute("href", "mailto:sabine@example.org");
  });

  it("shows no contact buttons without contact data", () => {
    render(<RecordHeader title="Ohne Kontakt" contact={{ phone: null, email: null }} />);
    expect(screen.queryByRole("link", { name: "Anrufen" })).not.toBeInTheDocument();
  });
});

describe("DetailLayout", () => {
  it("puts the work area before the facts in reading order (phones)", () => {
    const { container } = render(<DetailLayout header={<div />} main={<p>Aktivitäten</p>} aside={<p>Details</p>} />);
    const text = container.textContent ?? "";
    expect(text.indexOf("Aktivitäten")).toBeLessThan(text.indexOf("Details"));
  });
});
