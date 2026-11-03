import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Customer } from "../../hooks/useCustomers/useCustomers";

const openModal = vi.hoisted(() => vi.fn());
vi.mock("../../hooks/useCustomers/useCustomers", () => ({
  useConsents: () => ({ data: [], record: { mutateAsync: vi.fn(), isPending: false } }),
}));
vi.mock("../../context/banner/BannerContext", () => ({ useBanner: () => ({ showBanner: vi.fn() }) }));
vi.mock("../../context/modal/ModalContext", () => ({ useModal: () => ({ openModal, closeModal: vi.fn() }) }));

const { ConsentCard } = await import("./ConsentCard");
const customer = { id: "c1", email: "a@b.de", phone: "+491701234567", date_of_birth: null, archived_at: null, status: "active" } as unknown as Customer;

describe("ConsentCard", () => {
  it("P5-UX-01 the objection is confirmed in a dialog, not saved on one click", () => {
    render(<ConsentCard customer={customer} mode="full" />);
    fireEvent.click(screen.getByRole("button", { name: /Widerspruch: keine Kontaktaufnahme/ }));
    expect(openModal).toHaveBeenCalledWith(expect.objectContaining({ title: "Widerspruch gegen jede Kontaktaufnahme" }));
  });

  it("P5-PRIV-01 compliance records withdrawals and objections, never grants", () => {
    render(<ConsentCard customer={customer} mode="objection" />);
    expect(screen.getByRole("button", { name: "Widerruf erfassen" })).toBeInTheDocument();
    expect(screen.queryByText("Rechtsgrundlage")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Widerspruch: keine Kontaktaufnahme/ })).toBeInTheDocument();
  });

  it("read-only shows the state without forms", () => {
    render(<ConsentCard customer={customer} mode="read" />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
