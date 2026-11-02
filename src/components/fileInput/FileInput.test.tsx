import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FileInput } from "./FileInput";

const csv = new File(["a;b\n1;2"], "produktion.csv", { type: "text/csv" });

describe("FileInput", () => {
  it("speaks German and opens the picker from label and button", () => {
    render(<FileInput label="CSV-Datei" file={null} onChange={vi.fn()} accept=".csv" />);
    expect(screen.getByText("Datei auswählen")).toBeInTheDocument();
    expect(screen.getByText("Keine Datei ausgewählt")).toBeInTheDocument();
    expect(screen.getByLabelText("CSV-Datei")).toHaveAttribute("type", "file");
  });

  it("reports the chosen file and shows its name and size", () => {
    const onChange = vi.fn();
    const { rerender } = render(<FileInput label="CSV-Datei" file={null} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("CSV-Datei"), { target: { files: [csv] } });
    expect(onChange).toHaveBeenCalledWith(csv);

    rerender(<FileInput label="CSV-Datei" file={csv} onChange={onChange} />);
    expect(screen.getByText("produktion.csv")).toBeInTheDocument();
    expect(screen.getByText("1 KB")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Datei entfernen" }));
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it("accepts dropped files of the allowed type only", () => {
    const onChange = vi.fn();
    render(<FileInput label="CSV-Datei" file={null} onChange={onChange} accept=".csv,text/csv" />);
    const zone = screen.getByText("Keine Datei ausgewählt").parentElement!;
    fireEvent.drop(zone, { dataTransfer: { files: [new File(["x"], "bild.png", { type: "image/png" })] } });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.drop(zone, { dataTransfer: { files: [csv] } });
    expect(onChange).toHaveBeenCalledWith(csv);
  });
});
