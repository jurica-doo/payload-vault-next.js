import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const mute = vi.hoisted(() => ({ mutate: vi.fn() }));

vi.mock("../../hooks/useTasks/useTasks", () => ({
  useNotifications: () => ({ data: [], markRead: { mutate: vi.fn() }, mute, muted: ["lead_first_contact"] }),
}));
vi.mock("../../context/banner/BannerContext", () => ({ useBanner: () => ({ showBanner: vi.fn() }) }));

const { NotificationBell } = await import("./NotificationBell");

describe("NotificationBell", () => {
  it("P4-UX-07 settings open with the saved mutes ticked, and saving keeps them", () => {
    render(<NotificationBell />);
    fireEvent.click(screen.getByRole("button", { name: "Benachrichtigungen" }));
    fireEvent.click(screen.getByRole("button", { name: "Benachrichtigungs-Einstellungen" }));
    expect(screen.getByRole("checkbox", { name: "Lead-Erstkontakt" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Zugewiesene Aufgaben" })).not.toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    expect(mute.mutate).toHaveBeenCalledWith(["lead_first_contact"], expect.anything());
  });
});
