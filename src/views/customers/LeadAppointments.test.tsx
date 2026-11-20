import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const inDays = (d: number) => new Date(Date.now() + d * 86400_000).toISOString();
vi.mock("../../hooks/useActivities/useActivities", () => ({
  useActivities: () => ({
    data: [
      { id: "a1", type: "appointment", outcome: null, scheduled_at: inDays(3), notes: "Beratung KV-Wechsel" },
      { id: "a2", type: "appointment", outcome: "held", scheduled_at: inDays(1), notes: "schon erledigt" },
      { id: "a3", type: "appointment", outcome: null, scheduled_at: inDays(-5), notes: "längst vorbei" },
      { id: "a4", type: "contact_attempt", outcome: "reached", scheduled_at: null, notes: "kein Termin" },
    ],
  }),
}));

const { LeadAppointments } = await import("./LeadAppointments");

describe("LeadAppointments", () => {
  it("lists only open, upcoming appointments of the former lead", () => {
    render(<LeadAppointments leadId="l1" />);
    expect(screen.getByText("Offene Termine aus der Lead-Phase")).toBeInTheDocument();
    expect(screen.getByText(/Beratung KV-Wechsel/)).toBeInTheDocument();
    expect(screen.queryByText(/schon erledigt|längst vorbei|kein Termin/)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "beim Lead" })).toHaveAttribute("href", "/vertrieb/leads/l1");
  });
});
