import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PwaInstallPrompt } from "./PwaInstallPrompt";

let lastSignIn = "2026-11-02T08:00:00Z";
vi.mock("../../context/AuthContext", () => ({
  useAuth: () => ({ user: { id: "u1", last_sign_in_at: lastSignIn } }),
}));

const offerInstall = () =>
  act(() => {
    window.dispatchEvent(new Event("beforeinstallprompt"));
  });

const title = () => screen.queryByText("Payload Vault installieren");

describe("PwaInstallPrompt", () => {
  beforeEach(() => {
    // Date too: the countdown measures paused time with Date.now().
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    localStorage.clear();
    lastSignIn = "2026-11-02T08:00:00Z";
    window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as never;
  });
  afterEach(() => vi.useRealTimers());

  it("shows after login and removes itself after 10 seconds", () => {
    render(<PwaInstallPrompt />);
    offerInstall();
    expect(title()).not.toBeInTheDocument();

    act(() => vi.advanceTimersByTime(1500));
    expect(title()).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(10_000));
    expect(screen.getByRole("dialog")).toHaveClass("animate-slide-up-out");
    act(() => vi.advanceTimersByTime(150));
    expect(title()).not.toBeInTheDocument();
  });

  it("pauses the countdown while hovered", () => {
    render(<PwaInstallPrompt />);
    offerInstall();
    act(() => vi.advanceTimersByTime(1500)); // shown; the countdown starts after this render
    act(() => vi.advanceTimersByTime(4000));

    fireEvent.pointerEnter(screen.getByRole("dialog"));
    act(() => vi.advanceTimersByTime(30_000));
    expect(screen.getByRole("dialog")).not.toHaveClass("animate-slide-up-out");

    fireEvent.pointerLeave(screen.getByRole("dialog"));
    act(() => vi.advanceTimersByTime(6000));
    expect(screen.getByRole("dialog")).toHaveClass("animate-slide-up-out");
  });

  it("appears only once per login session", () => {
    const first = render(<PwaInstallPrompt />);
    offerInstall();
    act(() => vi.advanceTimersByTime(1500));
    first.unmount();

    // Reload in the same session: nothing.
    const again = render(<PwaInstallPrompt />);
    offerInstall();
    act(() => vi.advanceTimersByTime(5000));
    expect(title()).not.toBeInTheDocument();
    again.unmount();

    // Next login: shown again.
    lastSignIn = "2026-11-03T08:00:00Z";
    render(<PwaInstallPrompt />);
    offerInstall();
    act(() => vi.advanceTimersByTime(1500));
    expect(title()).toBeInTheDocument();
  });

  it("stays away for 14 days after 'Nicht jetzt'", () => {
    const first = render(<PwaInstallPrompt />);
    offerInstall();
    act(() => vi.advanceTimersByTime(1500));
    fireEvent.click(screen.getByRole("button", { name: "Nicht jetzt" }));
    first.unmount();

    lastSignIn = "2026-11-03T08:00:00Z";
    render(<PwaInstallPrompt />);
    offerInstall();
    act(() => vi.advanceTimersByTime(5000));
    expect(title()).not.toBeInTheDocument();
  });

  it("waits until the cookie notice is answered", () => {
    document.documentElement.classList.add("show--consent");
    render(<PwaInstallPrompt />);
    offerInstall();
    act(() => vi.advanceTimersByTime(5000));
    expect(title()).not.toBeInTheDocument();

    document.documentElement.classList.remove("show--consent");
    act(() => {
      window.dispatchEvent(new Event("cc:onConsent"));
    });
    act(() => vi.advanceTimersByTime(1500));
    expect(title()).toBeInTheDocument();
  });
});
