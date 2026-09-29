import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { DashboardLocation, OperatorSession } from "../src/api";
import { DashboardShellView } from "../src/components/dashboard/DashboardShell";
import { getAvailableDashboardSectionsFor } from "../src/lib/navigation/dashboard-sections";

function session(role: "owner" | "manager" | "store", capabilities: string[]): OperatorSession {
  return {
    apiBaseUrl: "https://api-dev.nomly.us/v1",
    accessToken: "test-access",
    refreshToken: "test-refresh",
    expiresAt: "2099-01-01T00:00:00.000Z",
    operator: {
      operatorUserId: "11111111-1111-4111-8111-111111111111",
      role,
      locationId: "loc-a",
      locationIds: ["loc-a", "loc-b"],
      displayName: "Nomly Operator",
      capabilities
    }
  } as unknown as OperatorSession;
}

const locations = [
  { locationId: "loc-a", locationName: "Downtown", marketLabel: "Detroit", storeName: "Nomly Cafe", appConfig: { storeCapabilities: { menu: { source: "platform_managed" }, operations: { fulfillmentMode: "staff", liveOrderTrackingEnabled: true, dashboardEnabled: true }, loyalty: { visible: true } } } },
  { locationId: "loc-b", locationName: "Airport", marketLabel: "Detroit", storeName: "Nomly Cafe", appConfig: { storeCapabilities: { menu: { source: "platform_managed" }, operations: { fulfillmentMode: "staff", liveOrderTrackingEnabled: true, dashboardEnabled: true }, loyalty: { visible: true } } } }
] as unknown as DashboardLocation[];

describe("React Dashboard V3 shell", () => {
  it("renders React-owned Home and Orders alongside unmigrated legacy Menu", () => {
    const html = renderToStaticMarkup(
      <DashboardShellView
        session={session("owner", ["orders:read", "menu:read", "store:read", "team:read"])}
        locations={locations}
        selectedLocationId="all"
        locationStatus="ready"
        onSelectLocation={() => undefined}
        onLogout={() => undefined}
      ><div>Home content</div></DashboardShellView>
    );
    expect(html).toContain('aria-current="page" title="Home" href="/"');
    expect(html).toContain('href="/orders"');
    expect(html).toContain('href="/legacy/menu"');
    expect(html).toContain('aria-label="Dashboard sections"');
    expect(html).toContain("Home content");
  });

  it("preserves the explicit All Locations selection in the workspace selector", () => {
    const html = renderToStaticMarkup(
      <DashboardShellView
        session={session("owner", ["orders:read"])}
        locations={locations}
        selectedLocationId="all"
        locationStatus="ready"
        onSelectLocation={() => undefined}
        onLogout={() => undefined}
      ><div /></DashboardShellView>
    );
    expect(html).toMatch(/<select><option value="all" selected="">All locations<\/option>/);
    expect(html).toContain("All locations");
    expect(html).toContain("Downtown · Detroit");
    expect(html).toContain("Airport · Detroit");
  });

  it("applies the existing capability and role visibility policy to navigation", () => {
    const limitedManager = session("manager", ["store:read"]).operator;
    const visible = getAvailableDashboardSectionsFor(limitedManager, locations);
    expect(visible).toEqual(["overview", "experience", "store"]);

    const storeOperator = session("store", ["orders:read"]).operator;
    expect(getAvailableDashboardSectionsFor(storeOperator, locations)).toEqual(["orders"]);

    const html = renderToStaticMarkup(
      <DashboardShellView
        session={session("manager", ["store:read"])}
        locations={locations}
        selectedLocationId="loc-a"
        locationStatus="ready"
        onSelectLocation={() => undefined}
        onLogout={() => undefined}
      ><div /></DashboardShellView>
    );
    expect(html).not.toContain('href="/orders"');
    expect(html).not.toContain('href="/legacy/menu"');
    expect(html).toContain('href="/legacy/store"');
  });

  it("uses the loading shell until authorized locations have been resolved", () => {
    const html = renderToStaticMarkup(
      <DashboardShellView
        session={session("owner", ["orders:read"])}
        locations={[]}
        selectedLocationId="all"
        locationStatus="loading"
        onSelectLocation={() => undefined}
        onLogout={() => undefined}
      ><div /></DashboardShellView>
    );
    expect(html).toContain('aria-label="Dashboard navigation loading"');
    expect(html).not.toContain('href="/orders"');
  });
});
