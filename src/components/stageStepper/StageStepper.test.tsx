import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StageStepper } from "./StageStepper";

const stages = [
  { id: "new", label: "Neu" },
  { id: "contacted", label: "Erreicht" },
  { id: "booked", label: "Termin vereinbart" },
  { id: "offer", label: "Angebot" },
];

const stateOf = (label: string) => screen.getByText(label).closest("li")?.getAttribute("data-state");

describe("StageStepper", () => {
  it("marks earlier stages done and the current one", () => {
    render(<StageStepper stages={stages} currentId="booked" />);
    expect(stateOf("Neu")).toBe("done");
    expect(stateOf("Erreicht")).toBe("done");
    expect(stateOf("Termin vereinbart")).toBe("current");
    expect(stateOf("Angebot")).toBe("todo");
  });

  it("P4-UX-11 shows stages that were never entered as skipped", () => {
    render(<StageStepper stages={stages} currentId="booked" visited={new Set(["new", "booked"])} />);
    expect(stateOf("Neu")).toBe("done");
    expect(stateOf("Erreicht")).toBe("skipped");
    expect(screen.getByText("(übersprungen)")).toBeInTheDocument();
  });

  it("replaces the tail with the outcome", () => {
    render(<StageStepper stages={stages} currentId="contacted" outcome={{ label: "Verloren", tone: "error" }} />);
    expect(screen.queryByText("Angebot")).not.toBeInTheDocument();
    expect(screen.getByText("Verloren")).toBeInTheDocument();
  });
});
