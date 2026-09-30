import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { OperatorDashboardSnapshot } from "../src/api";
import { StoreSettingsForm } from "../src/features/settings/components/StoreSettingsForm";
import { StoreSettingsPage } from "../src/features/settings/components/StoreSettingsPage";

const storeConfig: NonNullable<OperatorDashboardSnapshot["storeConfig"]> = {
  locationId: "location-a",
  storeName: "Northside Coffee",
  locationName: "Downtown",
  timezone: "America/Detroit",
  hours: "Daily 8 AM - 4 PM",
  pickupInstructions: "Pick up at the front counter.",
  taxRateBasisPoints: 625,
  capabilities: {
    menu: { source: "platform_managed" },
    operations: { fulfillmentMode: "staff", liveOrderTrackingEnabled: true, dashboardEnabled: true },
    loyalty: { visible: true }
  }
};

const noop = async () => true;

describe("React store Settings surface", () => {
  it("distinguishes All Locations from a location-specific configuration", () => {
    const allLocations = renderToStaticMarkup(<StoreSettingsPage config={null} status="ready" error={null} notice={null} mutationError={null} scopeKey="operator:all" selectedLocationId="all" selectedLocationName={null} canWrite isOwner={true} pending={false} onRetry={vi.fn()} onSave={noop} />);
    expect(allLocations).toContain("managed one location at a time");
    expect(allLocations).not.toContain("<form");

    const specificLocation = renderToStaticMarkup(<StoreSettingsPage config={storeConfig} status="ready" error={null} notice={null} mutationError={null} scopeKey="operator:location-a" selectedLocationId="location-a" selectedLocationName="Downtown" canWrite isOwner={true} pending={false} onRetry={vi.fn()} onSave={noop} />);
    expect(specificLocation).toContain("These values apply to Downtown");
    expect(specificLocation).toContain('name="taxRateBasisPoints"');
    expect(specificLocation).toContain("Launch setup");
    expect(specificLocation).not.toContain("America/Detroit");
  });

  it("keeps manager settings read-only and exposes the existing values", () => {
    const html = renderToStaticMarkup(<StoreSettingsForm config={storeConfig} scopeKey="manager:location-a" canWrite={false} pending={false} onSave={noop} />);
    expect(html).toContain("read-only for your current role");
    expect(html).toContain("Northside Coffee");
    expect(html).not.toContain("<form");
    expect(html).not.toContain("Save store settings");
  });

  it("shows explicit loading, retryable error, and mutation feedback states", () => {
    const loading = renderToStaticMarkup(<StoreSettingsPage config={null} status="loading" error={null} notice={null} mutationError={null} scopeKey="operator:location-a" selectedLocationId="location-a" selectedLocationName="Downtown" canWrite isOwner={false} pending={false} onRetry={vi.fn()} onSave={noop} />);
    expect(loading).toContain("Loading the latest settings");
    expect(loading).toContain('aria-busy="true"');

    const failed = renderToStaticMarkup(<StoreSettingsPage config={null} status="error" error="Gateway unavailable" notice={null} mutationError="Could not save" scopeKey="operator:location-a" selectedLocationId="location-a" selectedLocationName="Downtown" canWrite isOwner={false} pending={false} onRetry={vi.fn()} onSave={noop} />);
    expect(failed).toContain("Gateway unavailable");
    expect(failed).toContain("Could not save");
    expect(failed).toContain("Try again");

    const saved = renderToStaticMarkup(<StoreSettingsPage config={storeConfig} status="ready" error={null} notice="Saved store settings." mutationError={null} scopeKey="operator:location-a" selectedLocationId="location-a" selectedLocationName="Downtown" canWrite isOwner={false} pending={false} onRetry={vi.fn()} onSave={noop} />);
    expect(saved).toContain("Saved store settings.");
  });
});
