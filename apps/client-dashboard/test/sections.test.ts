import { afterEach, describe, expect, it } from "vitest";
import type { OperatorSession } from "../src/api";
import { getAvailableDashboardSections } from "../src/sections";
import { state } from "../src/state";
import { renderOnboardingWizard } from "../src/views/onboarding";
import { renderStoreSection } from "../src/views/store";

const ownerSession: OperatorSession = {
  accessToken: "access-token",
  refreshToken: "refresh-token",
  apiBaseUrl: "https://api.nomly.us/v1",
  expiresAt: "2026-05-06T13:00:00.000Z",
  operator: {
    operatorUserId: "11111111-1111-4111-8111-111111111111",
    displayName: "Pilot Owner",
    email: "owner@example.com",
    role: "owner",
    locationId: "northside-01",
    locationIds: ["northside-01"],
    active: true,
    capabilities: ["store:read", "store:write"],
    createdAt: "2026-05-06T12:00:00.000Z",
    updatedAt: "2026-05-06T12:00:00.000Z"
  }
};

const onboardingSummary = {
  tenantId: "tenant-northside",
  brandId: "northside-coffee",
  brandName: "Northside Coffee",
  locationId: "northside-01",
  locationName: "Northside Flagship",
  marketLabel: "Detroit, MI",
  status: "in_progress" as const,
  readyForReview: false,
  checklist: [],
  updatedAt: "2026-05-06T12:00:00.000Z"
};

const storeConfig = {
  locationId: "northside-01",
  storeName: "Northside Coffee",
  locationName: "Northside Flagship",
  hours: "Daily 8 AM - 4 PM",
  pickupInstructions: "Pick up at the front counter.",
  taxRateBasisPoints: 600,
  capabilities: {
    menu: {
      source: "platform_managed" as const
    },
    operations: {
      fulfillmentMode: "staff" as const,
      liveOrderTrackingEnabled: true,
      dashboardEnabled: true
    },
    loyalty: {
      visible: true
    }
  }
};

describe("dashboard sections", () => {
  afterEach(() => {
    state.session = null;
    state.onboardingSummary = null;
    state.onboardingWizardOpen = false;
    state.onboardingWizardStep = 1;
    state.availableLocations = [];
    state.appConfig = null;
    state.storeConfig = null;
  });

  it("keeps setup out of dashboard navigation and embeds it in owner settings", () => {
    state.session = ownerSession;
    state.onboardingSummary = onboardingSummary;
    state.storeConfig = storeConfig;

    expect(getAvailableDashboardSections()).not.toContain("onboarding");
    expect(getAvailableDashboardSections()).toContain("store");
    expect(renderStoreSection()).toContain("Launch setup");
    expect(renderStoreSection()).toContain("6 setup items left");
    expect(renderStoreSection()).toContain("Optional connectors");

    state.session = {
      ...ownerSession,
      operator: {
        ...ownerSession.operator,
        role: "manager"
      }
    };
    expect(getAvailableDashboardSections()).not.toContain("onboarding");
    expect(renderStoreSection()).not.toContain("Launch setup");

    state.session = ownerSession;
    state.onboardingSummary = {
      ...onboardingSummary,
      status: "approved"
    };
    expect(getAvailableDashboardSections()).not.toContain("onboarding");
    expect(renderStoreSection()).toContain("Launch approved");
  });

  it("renders incomplete owner onboarding as a popup wizard when opened", () => {
    state.session = ownerSession;
    state.onboardingSummary = onboardingSummary;
    state.storeConfig = storeConfig;
    state.onboardingWizardOpen = true;

    const html = renderOnboardingWizard();

    expect(html).toContain("role=\"dialog\"");
    expect(html).toContain("Northside Coffee launch setup");
    expect(html).toContain("We only need the essentials first.");
    expect(html).toContain("Details");
    expect(html).not.toContain("Launch review");
  });

  it("renders approved and live launch states as read-only setup status", () => {
    state.session = ownerSession;
    state.storeConfig = storeConfig;
    state.onboardingSummary = {
      ...onboardingSummary,
      status: "approved",
      approvedAt: "2026-05-06T15:00:00.000Z",
      mobileRelease: {
        locationId: "northside-01",
        status: "ready_for_launch",
        buildNumber: "42"
      }
    };

    const approvedHtml = renderStoreSection();
    expect(approvedHtml).toContain("Launch approved");
    expect(approvedHtml).toContain("Ready for launch");

    state.onboardingSummary = {
      ...state.onboardingSummary,
      status: "live",
      liveAt: "2026-05-06T16:00:00.000Z",
      mobileRelease: {
        locationId: "northside-01",
        status: "live",
        appStoreUrl: "https://apps.apple.com/us/app/example/id123456789",
        buildNumber: "42"
      }
    };

    const liveHtml = renderStoreSection();
    expect(liveHtml).toContain("App is live");
    expect(liveHtml).toContain("Live");
  });

  it("renders mobile release progress as read-only onboarding status", () => {
    state.session = ownerSession;
    state.storeConfig = storeConfig;
    state.onboardingSummary = {
      ...onboardingSummary,
      checklist: [
        {
          id: "mobile_release_ready",
          label: "Mobile release ready",
          status: "pending",
          passed: false,
          required: true,
          manual: true
        }
      ],
      mobileRelease: {
        locationId: "northside-01",
        status: "submitted_for_review",
        buildNumber: "42",
        testFlightUrl: "https://testflight.apple.com/join/example",
        updatedAt: "2026-05-06T12:00:00.000Z"
      }
    };

    const html = renderStoreSection();

    expect(html).toContain("Submitted to App Store");
    expect(html).toContain("TestFlight");
    expect(html).toContain("Build");
    expect(html).not.toContain("data-action=\"mobile-release\"");
  });
});
