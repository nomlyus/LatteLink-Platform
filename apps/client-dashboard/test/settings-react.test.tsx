import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { OperatorDashboardSnapshot } from "../src/api";
import { StoreSettingsForm } from "../src/features/settings/components/StoreSettingsForm";
import { StoreSettingsPage } from "../src/features/settings/components/StoreSettingsPage";
import { getMatchingStoreSettings } from "../src/features/settings/store-settings-search";
import { AppProfileForm } from "../src/features/settings/components/AppProfileForm";
import { onboardingSummarySchema } from "@lattelink/contracts-catalog";

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
    expect(specificLocation).toContain('aria-label="Location settings for Downtown"');
    expect(specificLocation).not.toContain("Manage storefront details");
    expect(specificLocation).toContain('name="taxRateBasisPoints"');
    expect(specificLocation).toContain("Launch readiness");
    expect(specificLocation).toContain("App profile");
    expect(specificLocation).toContain("Payments");
    expect(specificLocation).not.toContain("America/Detroit");
  });

  it("searches settings labels and values without removing other draft controls", () => {
    expect([...getMatchingStoreSettings(storeConfig, "tax 625")]).toEqual(["taxRateBasisPoints"]);
    expect([...getMatchingStoreSettings(storeConfig, "front counter")]).toEqual(["pickupInstructions"]);
    expect(getMatchingStoreSettings(storeConfig, "").size).toBe(5);
    expect(getMatchingStoreSettings(storeConfig, "missing").size).toBe(0);
    const html = renderToStaticMarkup(<StoreSettingsForm config={storeConfig} query="tax" scopeKey="owner:location-a" canWrite pending={false} onSave={noop} />);
    expect(html).toContain('name="storeName"');
    expect(html).toContain('name="pickupInstructions"');
    expect(html.match(/hidden=""/g)).toHaveLength(4);
    const empty = renderToStaticMarkup(<StoreSettingsForm config={storeConfig} query="missing" scopeKey="owner:location-a" canWrite pending={false} onSave={noop} />);
    expect(empty).toContain("No settings match this search");
    expect(empty).toContain('name="taxRateBasisPoints"');
  });

  it("keeps limited-write owner settings read-only and exposes the existing values", () => {
    const html = renderToStaticMarkup(<StoreSettingsForm config={storeConfig} scopeKey="owner:location-a" canWrite={false} pending={false} onSave={noop} />);
    expect(html).toContain("read-only for your current role");
    expect(html).toContain("Northside Coffee");
    expect(html).not.toContain("<form");
    expect(html).not.toContain("Save store settings");
  });

  it("shows explicit loading, retryable error, and mutation feedback states", () => {
    const loading = renderToStaticMarkup(<StoreSettingsPage config={null} status="loading" error={null} notice={null} mutationError={null} scopeKey="operator:location-a" selectedLocationId="location-a" selectedLocationName="Downtown" canWrite isOwner pending={false} onRetry={vi.fn()} onSave={noop} />);
    expect(loading).toContain("Loading the latest settings");
    expect(loading).toContain('aria-busy="true"');

    const failed = renderToStaticMarkup(<StoreSettingsPage config={null} status="error" error="Gateway unavailable" notice={null} mutationError="Could not save" scopeKey="operator:location-a" selectedLocationId="location-a" selectedLocationName="Downtown" canWrite isOwner pending={false} onRetry={vi.fn()} onSave={noop} />);
    expect(failed).toContain("Gateway unavailable");
    expect(failed).toContain("Could not save");
    expect(failed).toContain("Try again");

    const saved = renderToStaticMarkup(<StoreSettingsPage config={storeConfig} status="ready" error={null} notice="Saved store settings." mutationError={null} scopeKey="operator:location-a" selectedLocationId="location-a" selectedLocationName="Downtown" canWrite isOwner pending={false} onRetry={vi.fn()} onSave={noop} />);
    expect(saved).toContain("Saved store settings.");
  });

  it("does not render store configuration for a non-owner", () => {
    const html = renderToStaticMarkup(<StoreSettingsPage config={storeConfig} status="ready" error={null} notice={null} mutationError={null} scopeKey="manager:location-a" selectedLocationId="location-a" selectedLocationName="Downtown" canWrite isOwner={false} pending={false} onRetry={vi.fn()} onSave={noop} />);
    expect(html).toContain("only available to the store owner");
    expect(html).not.toContain("Northside Coffee");
    expect(html).not.toContain("625");
    expect(html).not.toContain("<form");
  });

  it("places app-profile fields in Settings and leaves identifiers Nomly-managed", () => {
    const summary = onboardingSummarySchema.parse({ tenantId: "tenant-a", brandId: "brand-a", brandName: "Northside", locationId: "location-a", locationName: "Downtown", marketLabel: "Detroit", status: "in_progress", readyForReview: false, checklist: [], updatedAt: "2026-01-01T00:00:00Z" });
    const html = renderToStaticMarkup(<AppProfileForm summary={summary} pending={false} canWrite query="" onSave={noop} />);
    for (const name of ["appName", "displayName", "subtitle", "description", "keywords", "supportUrl", "privacyPolicyUrl", "marketingUrl", "assetMode", "iconAssetUrl", "splashAssetUrl", "screenshotAssetUrls"]) expect(html).toContain(`name="${name}"`);
    expect(html).not.toContain('name="bundleIdentifier"');
    expect(html).not.toContain('name="sku"');
  });
});
