import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { UserFacingError } from "../../utils/dbErrors";

const m = vi.hoisted(() => ({
  hasMfa: true,
  showBanner: vi.fn(),
  openModal: vi.fn(),
  campaignAction: vi.fn(),
  setWindow: vi.fn(),
  importSuppressions: vi.fn(),
  sendLog: vi.fn(),
  suppressions: vi.fn(),
}));
const mutation = (fn: (...a: unknown[]) => unknown) => ({ mutateAsync: fn, isPending: false });
vi.mock("../../hooks/permissions/usePermissions", () => ({
  usePermissions: () => ({ permissions: { isAdmin: true, isCompliance: false, hasMfa: m.hasMfa } }),
}));
vi.mock("../../context/AuthContext", () => ({ useAuth: () => ({ user: { id: "me" } }) }));
vi.mock("../../context/banner/BannerContext", () => ({ useBanner: () => ({ showBanner: m.showBanner }) }));
vi.mock("../../context/modal/ModalContext", () => ({ useModal: () => ({ openModal: m.openModal, closeModal: vi.fn() }) }));
vi.mock("../../hooks/useEmail/useEmail", () => ({
  CUSTOMER_EMAIL_LIMIT: 50,
  useEmailTemplates: () => ({
    data: { templates: [{ id: "t1", name: "Geburtstag", purpose: "birthday", allowed_bases: ["consent"], active_version_id: null, archived_at: null }], versions: [] },
    saveTemplate: mutation(vi.fn()), saveDraft: mutation(vi.fn()), submit: mutation(vi.fn()), decide: mutation(vi.fn()),
  }),
  useEmailOps: () => ({
    status: { data: { enabled: false, window_start: "09:00", window_end: "18:00", window_days: [1, 2, 3, 4, 5], daily_limit: 500, in_window: true, last_7_days: {} } },
    campaigns: { data: [
      { id: "k1", name: "Geburtstage", kind: "birthday", status: "paused", created_by: "other", template_version_id: null, send_on: null },
    ] },
    setEnabled: mutation(vi.fn()), setWindow: mutation(m.setWindow), saveCampaign: mutation(vi.fn()),
    campaignAction: mutation(m.campaignAction), setSuppression: mutation(vi.fn()),
    importSuppressions: mutation(m.importSuppressions), sendTest: mutation(vi.fn()),
  }),
  useSuppressions: (...a: unknown[]) => m.suppressions(...a),
  useSendLog: (...a: unknown[]) => m.sendLog(...a),
}));

const { CommunicationPage } = await import("./CommunicationPage");
const { SuppressionImport } = await import("./SuppressionImport");

beforeEach(() => {
  m.hasMfa = true;
  vi.clearAllMocks();
  m.suppressions.mockReturnValue({ data: { rows: [{ email: "a@b.de", reason: "opt_out", note: null, created_at: "2026-11-01T10:00:00Z" }], total: 1 } });
  m.sendLog.mockReturnValue({ data: { rows: [
    { id: "l1", created_at: "2026-11-01T10:00:00Z", mode: "campaign", occasion_date: "2026-11-01", status: "suppressed",
      suppression_reason: null, legal_basis: "consent", last_error: null, customers: { customer_no: 42 } },
  ], total: 1 } });
});

describe("CommunicationPage", () => {
  it("P6-08 without 2FA every write action is disabled", () => {
    m.hasMfa = false;
    render(<CommunicationPage />);
    for (const name of ["Versand einschalten", "Fortsetzen", "Kampagne anlegen", "Sperren", "CSV importieren", "Vorlage anlegen"]) {
      expect(screen.getByRole("button", { name })).toBeDisabled();
    }
  });

  it("P6-04 the send window uses time inputs and reports a bad order", () => {
    render(<CommunicationPage />);
    const from = screen.getByLabelText(/Fenster von/);
    expect(from).toHaveAttribute("type", "time");
    fireEvent.change(from, { target: { value: "19:00" } });
    expect(screen.getByRole("alert")).toHaveTextContent("Das Fenster muss vor seinem Ende beginnen.");
    expect(screen.getByRole("button", { name: "Fenster speichern" })).toBeDisabled();
  });

  it("P6-05 a campaign action confirms with a toast, a refusal names what failed", async () => {
    render(<CommunicationPage />);
    m.campaignAction.mockResolvedValueOnce(null);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Fortsetzen" })); });
    expect(m.showBanner).toHaveBeenCalledWith("Kampagne fortgesetzt", expect.any(String), "success");
    m.campaignAction.mockRejectedValueOnce(new UserFacingError("Es ist bereits eine Geburtstagskampagne aktiv."));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Fortsetzen" })); });
    expect(m.showBanner).toHaveBeenCalledWith("Kampagne nicht fortgesetzt", "Es ist bereits eine Geburtstagskampagne aktiv.", "error");
  });

  it("P6-06 the send log shows the K-number and a German legal basis, filtered in the database", () => {
    render(<CommunicationPage />);
    expect(screen.getAllByText("K-00042").length).toBeGreaterThan(0);
    expect(screen.queryByText(/Grundlage consent/)).not.toBeInTheDocument();
    expect(m.sendLog).toHaveBeenCalledWith(true, expect.objectContaining({ status: "", page: 1 }));
  });

  it("P6-07 the block list shows a German reason", () => {
    render(<CommunicationPage />);
    expect(screen.getByText(/Abmeldung \/ Widerspruch/)).toBeInTheDocument();
  });
});

const csv = (text: string) => new File([text], "liste.csv", { type: "text/csv" });

describe("SuppressionImport", () => {
  it("P6-13 reads the file, imports and lists bad rows by number only", async () => {
    m.importSuppressions.mockResolvedValueOnce({ added: 1, already_blocked: 0, failed: 1, errors: [{ row: 2, code: "invalid_email" }] });
    render(<SuppressionImport onDone={vi.fn()} />);
    await act(async () => { fireEvent.change(screen.getByLabelText(/CSV-Datei/), { target: { files: [csv("E-Mail;Grund\na@b.de;Abmeldung\nkaputt;\n")] } }); });
    const submit = await screen.findByRole("button", { name: "2 Adressen sperren" });
    await act(async () => { fireEvent.click(submit); });
    expect(m.importSuppressions).toHaveBeenCalledWith({ rows: [{ email: "a@b.de", reason: "opt_out" }, { email: "kaputt" }], reason: "opt_out", note: "" });
    await waitFor(() => expect(screen.getAllByText("Keine gültige E-Mail-Adresse").length).toBeGreaterThan(0));
    expect(m.showBanner).toHaveBeenCalledWith("Sperrliste importiert", expect.stringContaining("1 neu gesperrt"), "warning");
    // P6-R2-01: data row 2 is line 3 in the file (after the header).
    expect(screen.getAllByRole("cell", { name: "3" }).length).toBeGreaterThan(0);
  });

  it("P6-13 a file without an address column is explained, nothing is sent", async () => {
    render(<SuppressionImport onDone={vi.fn()} />);
    await act(async () => { fireEvent.change(screen.getByLabelText(/CSV-Datei/), { target: { files: [csv("Name;Ort\nMax;Köln\n")] } }); });
    expect(await screen.findByText(/Keine Spalte „E-Mail“ gefunden/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Importieren" })).toBeDisabled();
    expect(m.importSuppressions).not.toHaveBeenCalled();
  });
});
