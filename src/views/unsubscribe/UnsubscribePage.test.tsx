import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UnsubscribePage } from "./UnsubscribePage";

const TOKEN = "3f1c2b8a-1d2e-4f5a-9b7c-0a1b2c3d4e5f";

afterEach(() => vi.unstubAllGlobals());

describe("UnsubscribePage", () => {
  it("names what the client stops receiving and changes nothing before the click", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<UnsubscribePage token={TOKEN} purpose="birthday_email" />);
    expect(screen.getByText("Geburtstagsgrüße")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("confirms the unsubscription after the click", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);
    render(<UnsubscribePage token={TOKEN} purpose="holiday_email" />);
    fireEvent.click(screen.getByRole("button", { name: "Abmelden bestätigen" }));
    expect(await screen.findByText("Sie sind abgemeldet.")).toBeInTheDocument();
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ t: TOKEN, z: "holiday_email" });
    expect(fetchMock.mock.calls[0][1].method).toBe("POST");
  });

  it("explains a broken link without offering the button", () => {
    render(<UnsubscribePage token="kaputt" purpose="birthday_email" />);
    expect(screen.getByText("Dieser Link funktioniert nicht.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Abmelden bestätigen" })).not.toBeInTheDocument();
  });

  it("asks to retry later when rate limited", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 429 }));
    render(<UnsubscribePage token={TOKEN} purpose="marketing_email" />);
    fireEvent.click(screen.getByRole("button", { name: "Abmelden bestätigen" }));
    await waitFor(() => expect(screen.getByText(/Zu viele Versuche/)).toBeInTheDocument());
  });
});
