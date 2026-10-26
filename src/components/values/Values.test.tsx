import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AeValue, MoneyValue, PointsValue } from "./Values";
import { StatusBadge } from "../statusBadge/StatusBadge";
import { ProvisionalRuleNotice } from "../provisionalRuleNotice/ProvisionalRuleNotice";
import { RoleGate } from "../roleGate/RoleGate";

describe("value components", () => {
  it("shows money with its kind label and flags negatives", () => {
    const { container } = render(<MoneyValue value="-28.00" kind="reserve" />);
    expect(container.textContent?.replace(/\s/g, " ")).toMatch(/-28,00 €.*Reserve/);
    expect(container.firstChild).toHaveClass("text-color-error-text");
  });

  it("does not flag a value that rounds to zero", () => {
    const { container } = render(<MoneyValue value="-0.001" />);
    expect(container.firstChild).not.toHaveClass("text-color-error-text");
  });

  it("neutral tone never colours negatives", () => {
    const { container } = render(<MoneyValue value={-5} tone="neutral" />);
    expect(container.firstChild).not.toHaveClass("text-color-error-text");
  });

  it("labels KV points separately from total points", () => {
    render(
      <>
        <PointsValue value="10.5" />
        <PointsValue value="25" isKv />
      </>,
    );
    expect(screen.getByText("10,50")).toBeInTheDocument();
    expect(screen.getByText("KV-P")).toBeInTheDocument();
  });

  it("shows AE as a grouped integer and a dash for missing values", () => {
    render(
      <>
        <AeValue value="252000" />
        <AeValue value={null} />
      </>,
    );
    expect(screen.getByText("252.000")).toBeInTheDocument();
    expect(screen.getByText("–")).toBeInTheDocument();
  });
});

describe("StatusBadge", () => {
  const map = { approved: { label: "Freigegeben", tone: "success" as const } };

  it("renders the mapped label", () => {
    render(<StatusBadge status="approved" map={map} />);
    expect(screen.getByText("Freigegeben")).toBeInTheDocument();
  });

  it("still renders unknown statuses", () => {
    render(<StatusBadge status="disputed" map={map} />);
    expect(screen.getByText("disputed")).toBeInTheDocument();
  });
});

describe("ProvisionalRuleNotice / RoleGate", () => {
  it("names the open decision", () => {
    render(<ProvisionalRuleNotice decisionId="OD-05" />);
    expect(screen.getByRole("note")).toHaveTextContent("Vorläufige Regel (OD-05)");
  });

  it("renders children or fallback", () => {
    const { rerender } = render(
      <RoleGate when={false} fallback={<span>nein</span>}>
        <span>ja</span>
      </RoleGate>,
    );
    expect(screen.getByText("nein")).toBeInTheDocument();
    rerender(
      <RoleGate when>
        <span>ja</span>
      </RoleGate>,
    );
    expect(screen.getByText("ja")).toBeInTheDocument();
  });
});
