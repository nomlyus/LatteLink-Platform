import React, { type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authState = vi.hoisted(() => ({ status: "authenticated", role: "owner" }));
vi.mock("../src/features/auth/session-provider", () => ({
  useDashboardSession: () => ({
    status: authState.status,
    session: authState.status === "authenticated" ? { operator: { operatorUserId: "operator-a", role: authState.role } } : null
  })
}));
vi.mock("../src/components/dashboard/DashboardShell", () => ({
  DashboardShell: ({ children, search }: { children: ReactNode; search: ReactNode }) => <div>{search}{children}</div>,
  DashboardShellLoading: () => <div>Loading dashboard</div>
}));
vi.mock("../src/features/auth/components/SignInRoute", () => ({ SignInRoute: () => <div>Sign in</div> }));
vi.mock("../src/features/orders/components/OrdersManagementPage", () => ({ OrdersManagementPage: () => <div>Orders management screen</div> }));
vi.mock("../src/features/orders/components/StoreOrdersPage", () => ({ StoreOrdersPage: () => <div>Store fulfillment screen</div> }));

import { OrdersRoute } from "../src/features/orders/components/OrdersRoute";

beforeEach(() => { authState.status = "authenticated"; authState.role = "owner"; });

describe("Orders route screen ownership", () => {
  it.each(["owner", "manager"])("mounts only the management screen for %s", (role) => {
    authState.role = role;
    const html = renderToStaticMarkup(<OrdersRoute />);
    expect(html).toContain("Orders management screen");
    expect(html).not.toContain("Store fulfillment screen");
    expect(html).toContain('aria-label="Search orders"');
  });

  it("mounts only the fulfillment screen for a store operator", () => {
    authState.role = "store";
    const html = renderToStaticMarkup(<OrdersRoute />);
    expect(html).toContain("Store fulfillment screen");
    expect(html).not.toContain("Orders management screen");
  });

  it.each(["loading", "signed-out"])("mounts neither Orders screen while %s", (status) => {
    authState.status = status;
    const html = renderToStaticMarkup(<OrdersRoute />);
    expect(html).toContain(status === "loading" ? "Loading dashboard" : "Sign in");
    expect(html).not.toContain("Orders management screen");
    expect(html).not.toContain("Store fulfillment screen");
    expect(html).not.toContain('aria-label="Search orders"');
  });
});
