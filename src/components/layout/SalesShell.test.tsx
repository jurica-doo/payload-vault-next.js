import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SALES_MODULES } from "../../data/salesModules";
import { derivePermissions, visibleModules } from "../../hooks/permissions/permissions";

const state = vi.hoisted(() => ({
  pathname: "/vertrieb/produktion",
  perms: { isLoading: false, isError: false, ctx: null as unknown },
}));

vi.mock("next/navigation", () => ({ usePathname: () => state.pathname }));
vi.mock("../header/HeaderHome", () => ({
  HeaderHome: ({ pageTitle }: { pageTitle?: string }) => <header>{pageTitle}</header>,
}));
vi.mock("../footer/MiniFooter", () => ({ MiniFooter: () => null }));
vi.mock("../loadingScreen/LoadingScreen", () => ({ LoadingScreen: () => <p>lädt</p> }));
vi.mock("../../hooks/permissions/usePermissions", () => ({
  usePermissions: () => {
    const permissions = derivePermissions(state.perms.ctx);
    return {
      permissions,
      modules: visibleModules(permissions),
      isLoading: state.perms.isLoading,
      isError: state.perms.isError,
    };
  },
}));

const { SalesShell } = await import("./SalesShell");

const allFlags = Object.fromEntries(SALES_MODULES.map((m) => [m.key, true]));
const adviser = {
  user_id: "u",
  aal: "aal1",
  employee: { id: "e", status: "active" },
  roles: [],
  descendant_count: 0,
  feature_flags: allFlags,
};

const renderShell = () =>
  render(
    <SalesShell>
      <p>Seiteninhalt</p>
    </SalesShell>,
  );

describe("SalesShell", () => {
  beforeEach(() => {
    state.pathname = "/vertrieb/produktion";
    state.perms = { isLoading: false, isError: false, ctx: adviser };
  });

  it("renders the page and module tabs when allowed", () => {
    renderShell();
    expect(screen.getByText("Seiteninhalt")).toBeInTheDocument();
    expect(screen.getByRole("banner")).toHaveTextContent("Produktion");
    expect(screen.getByRole("link", { name: "Produktion" })).toHaveAttribute("aria-current", "page");
    expect(screen.queryByRole("link", { name: "Team" })).not.toBeInTheDocument(); // not a leader
    expect(screen.queryByRole("link", { name: "Verwaltung" })).not.toBeInTheDocument();
  });

  it("hides the page when the module flag is off", () => {
    state.perms.ctx = { ...adviser, feature_flags: { ...allFlags, production: false } };
    renderShell();
    expect(screen.queryByText("Seiteninhalt")).not.toBeInTheDocument();
    expect(screen.getByText("Dieser Bereich ist für Sie nicht freigeschaltet.")).toBeInTheDocument();
  });

  it("hides team pages from advisers", () => {
    state.pathname = "/vertrieb/team";
    renderShell();
    expect(screen.queryByText("Seiteninhalt")).not.toBeInTheDocument();
  });

  it("shows the same neutral page for routes outside the registry", () => {
    state.pathname = "/vertrieb-geheim";
    renderShell();
    expect(screen.getByText("Dieser Bereich ist für Sie nicht freigeschaltet.")).toBeInTheDocument();
  });

  it("fails closed when the context cannot be loaded", () => {
    state.perms = { isLoading: false, isError: true, ctx: null };
    renderShell();
    expect(screen.queryByText("Seiteninhalt")).not.toBeInTheDocument();
    expect(screen.getByText(/konnten nicht geladen werden/)).toBeInTheDocument();
  });

  it("shows a loader while permissions load", () => {
    state.perms = { isLoading: true, isError: false, ctx: null };
    renderShell();
    expect(screen.getByText("lädt")).toBeInTheDocument();
    expect(screen.queryByText("Seiteninhalt")).not.toBeInTheDocument();
  });

  it("lets an admin into /admin without module tabs", () => {
    state.pathname = "/admin";
    state.perms.ctx = { ...adviser, employee: null, roles: ["admin"] };
    renderShell();
    expect(screen.getByText("Seiteninhalt")).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Vertriebsbereiche" })).not.toBeInTheDocument();
  });
});
